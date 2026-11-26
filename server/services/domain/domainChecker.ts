import { Resolver } from 'node:dns/promises';
import net from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  BrandCandidate,
  DomainVerificationResult,
  RawLexiconEntry,
} from '../../../src/types/brand.ts';
import {
  analyzePhonetics,
  normalizeBrandWord,
  toTitleCase,
} from '../phonetics/brandScorer.ts';
import { lookupLiveDefinitionQuick } from '../dictionary/datamuseClient.ts';

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, Record<string, string>, string, string]>];
}

interface RdapDomainResponse {
  ldhName?: string;
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

const CACHE_DIR = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'domain-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const dnsResolver = new Resolver({ timeout: 2200, tries: 1 });
dnsResolver.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);

const memoryCache = new Map<string, DomainVerificationResult>();
let cacheLoaded = false;
let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  cacheLoaded = true;

  if (!existsSync(CACHE_FILE)) return;
  try {
    const raw = await readFile(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, DomainVerificationResult>;
    const now = Date.now();

    for (const [domain, entry] of Object.entries(parsed)) {
      const age = now - new Date(entry.checkedAt).getTime();
      if (entry.status !== 'unknown' && age < CACHE_TTL_MS) {
        memoryCache.set(domain, { ...entry, fromCache: true });
      }
    }
  } catch {
    // Ignore corrupted cache file and rebuild cleanly
  }
}

function scheduleCacheFlush(): void {
  if (pendingSaveTimer) return;
  pendingSaveTimer = setTimeout(async () => {
    pendingSaveTimer = null;
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      const serializable: Record<string, DomainVerificationResult> = {};
      for (const [key, val] of memoryCache.entries()) {
        if (val.status !== 'unknown') {
          serializable[key] = val;
        }
      }
      await writeFile(CACHE_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
    } catch {
      // Non-fatal cache write failure
    }
  }, 1500);
}

export async function getCachedDomainCount(): Promise<number> {
  await ensureCacheLoaded();
  return memoryCache.size;
}

async function hasActiveDnsDelegation(domain: string): Promise<boolean> {
  try {
    const nsRecords = await dnsResolver.resolveNs(domain);
    return Array.isArray(nsRecords) && nsRecords.length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return false;
    }
    try {
      const aRecords = await dnsResolver.resolve4(domain);
      return Array.isArray(aRecords) && aRecords.length > 0;
    } catch {
      return false;
    }
  }
}

function resolveRdapEndpoint(domain: string, tld: string): string {
  switch (tld) {
    case 'com':
    case 'net':
      return `https://rdap.verisign.com/${tld}/v1/domain/${domain}`;
    case 'org':
      return `https://rdap.publicinterestregistry.org/rdap/domain/${domain}`;
    case 'dev':
    case 'app':
      return `https://pubapi.registry.google/rdap/domain/${domain}`;
    case 'xyz':
      return `https://rdap.centralnic.com/xyz/domain/${domain}`;
    default:
      return `https://rdap.org/domain/${domain}`;
  }
}

function parseRdapMetadata(body: RdapDomainResponse): {
  registrar?: string;
  registeredAt?: string;
} {
  let registrar: string | undefined;
  let registeredAt: string | undefined;

  for (const entity of body.entities ?? []) {
    if (entity.roles?.includes('registrar') && entity.vcardArray?.[1]) {
      const fnRow = entity.vcardArray[1].find((row) => row[0] === 'fn');
      if (fnRow?.[3]) {
        registrar = fnRow[3];
        break;
      }
    }
  }

  for (const evt of body.events ?? []) {
    if (evt.eventAction === 'registration' && evt.eventDate) {
      registeredAt = evt.eventDate.slice(0, 10);
      break;
    }
  }

  return { registrar, registeredAt };
}

async function queryWhoisPort43(
  domain: string,
  tld: string,
): Promise<DomainVerificationResult | null> {
  const hostMap: Record<string, string> = {
    com: 'whois.verisign-grs.com',
    net: 'whois.verisign-grs.com',
    org: 'whois.pir.org',
    io: 'whois.nic.io',
    ai: 'whois.nic.ai',
    co: 'whois.nic.co',
    dev: 'whois.nic.google',
    xyz: 'whois.nic.xyz',
  };

  const server = hostMap[tld];
  if (!server) return null;

  const queryPayload = tld === 'com' || tld === 'net' ? `domain ${domain}\r\n` : `${domain}\r\n`;

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: server, port: 43 });
    let rawText = '';
    let settled = false;

    const finish = (res: DomainVerificationResult | null): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(res);
    };

    socket.setTimeout(4500);
    socket.on('connect', () => {
      socket.write(queryPayload);
    });
    socket.on('data', (chunk: Buffer) => {
      rawText += chunk.toString('utf-8');
    });
    socket.on('timeout', () => finish(null));
    socket.on('error', () => finish(null));
    socket.on('end', () => {
      const checkedAt = new Date().toISOString();
      const lower = rawText.toLowerCase();

      const notFoundSignals = [
        'no match for',
        'not found',
        'domain not found',
        'no data found',
        'is available for registration',
      ];

      if (notFoundSignals.some((sig) => lower.includes(sig))) {
        finish({
          domain,
          tld,
          status: 'available',
          verificationMethod: tld === 'com' ? 'whois-verisign' : 'whois-iana',
          checkedAt,
          fromCache: false,
        });
        return;
      }

      if (lower.includes('domain name:') || lower.includes('registrar:')) {
        const regMatch = rawText.match(/Registrar:\s*(.+)/i);
        const dateMatch = rawText.match(/Creation Date:\s*([0-9T:-]+)/i);
        finish({
          domain,
          tld,
          status: 'taken',
          verificationMethod: tld === 'com' ? 'whois-verisign' : 'whois-iana',
          registrar: regMatch?.[1]?.trim(),
          registeredAt: dateMatch?.[1]?.slice(0, 10),
          checkedAt,
          fromCache: false,
        });
        return;
      }

      finish(null);
    });
  });
}

export async function verifyDomainAvailability(
  wordRaw: string,
  tld = 'com',
  forceRefresh = false,
): Promise<DomainVerificationResult> {
  await ensureCacheLoaded();

  const cleanWord = normalizeBrandWord(wordRaw);
  const cleanTld = tld.toLowerCase().replace(/^\./, '');
  const domain = `${cleanWord}.${cleanTld}`;

  if (!forceRefresh) {
    const cached = memoryCache.get(domain);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  // Stage 1: Fast DNS delegation check catches active domains in ~20ms
  const delegated = await hasActiveDnsDelegation(domain);
  if (delegated) {
    const takenDns: DomainVerificationResult = {
      domain,
      tld: cleanTld,
      status: 'taken',
      verificationMethod: 'dns-delegation',
      checkedAt: new Date().toISOString(),
      fromCache: false,
    };
    memoryCache.set(domain, takenDns);
    scheduleCacheFlush();
    return takenDns;
  }

  // Stage 2: Authoritative RDAP registry verification (catches parked/held domains too)
  try {
    const rdapUrl = resolveRdapEndpoint(domain, cleanTld);
    const response = await fetch(rdapUrl, {
      signal: AbortSignal.timeout(4800),
      headers: { Accept: 'application/rdap+json, application/json' },
    });

    if (response.status === 404) {
      const availableRes: DomainVerificationResult = {
        domain,
        tld: cleanTld,
        status: 'available',
        verificationMethod: cleanTld === 'com' ? 'rdap-verisign' : 'rdap-iana',
        checkedAt: new Date().toISOString(),
        fromCache: false,
      };
      memoryCache.set(domain, availableRes);
      scheduleCacheFlush();
      return availableRes;
    }

    if (response.ok) {
      const body = (await response.json()) as RdapDomainResponse;
      const meta = parseRdapMetadata(body);
      const takenRdap: DomainVerificationResult = {
        domain,
        tld: cleanTld,
        status: 'taken',
        verificationMethod: cleanTld === 'com' ? 'rdap-verisign' : 'rdap-iana',
        registrar: meta.registrar,
        registeredAt: meta.registeredAt,
        checkedAt: new Date().toISOString(),
        fromCache: false,
      };
      memoryCache.set(domain, takenRdap);
      scheduleCacheFlush();
      return takenRdap;
    }
  } catch {
    // Fall through to raw TCP Port 43 WHOIS
  }

  // Stage 3: Authoritative Port 43 WHOIS fallback
  const whoisRes = await queryWhoisPort43(domain, cleanTld);
  if (whoisRes) {
    memoryCache.set(domain, whoisRes);
    scheduleCacheFlush();
    return whoisRes;
  }

  return {
    domain,
    tld: cleanTld,
    status: 'unknown',
    verificationMethod: 'network-error',
    checkedAt: new Date().toISOString(),
    fromCache: false,
  };
}

export async function verifyLexiconCandidate(
  entry: RawLexiconEntry,
  forceRefresh = false,
): Promise<BrandCandidate> {
  const verification = await verifyDomainAvailability(entry.word, 'com', forceRefresh);
  const phonetics = analyzePhonetics(entry.word);

  let meaning = entry.meaning;
  if (!meaning && verification.status === 'available' && entry.source !== 'phonetic-formula') {
    meaning = await lookupLiveDefinitionQuick(entry.word);
  }

  return {
    word: entry.word,
    displayName: toTitleCase(entry.word),
    domain: verification.domain,
    status: verification.status,
    verificationMethod: verification.verificationMethod,
    registrar: verification.registrar,
    registeredAt: verification.registeredAt,
    checkedAt: verification.checkedAt,
    length: entry.word.length,
    syllables: phonetics.syllables,
    startsWith: phonetics.startsWith,
    ending: phonetics.ending,
    smoothnessScore: phonetics.smoothnessScore,
    pronunciationHint: phonetics.pronunciationHint,
    source: entry.source,
    languageOrigin: entry.languageOrigin,
    meaning,
  };
}

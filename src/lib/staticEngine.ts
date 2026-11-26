import type {
  BrandCandidate,
  BrandInspectionResponse,
  DictionaryStatsResponse,
  DiscoveryFilterParams,
  DiscoveryStreamEvent,
  DomainVerificationResult,
  ExportReportPayload,
  QuickCheckResponse,
  RawLexiconEntry,
} from '../types/brand.ts';
import {
  analyzePhonetics,
  matchesEndingCategory,
  normalizeBrandWord,
  toTitleCase,
} from '../../server/services/phonetics/brandScorer.ts';
import {
  fetchLiveWorldDictionaryWords,
  lookupFreeDictionaryDetails,
  lookupLiveDefinitionQuick,
} from '../../server/services/dictionary/datamuseClient.ts';
import { loadMultilingualLexicon } from '../../server/services/dictionary/multilingualLexicon.ts';
import {
  generatePhoneticFormulaPool,
} from '../../server/services/dictionary/phoneticGenerator.ts';
import {
  generateBrandReportPdf,
} from '../../server/services/export/pdfReportBuilder.ts';

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [
    string,
    Array<[string, Record<string, string>, string, string]>,
  ];
}

interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

interface DohResponse {
  Status?: number;
  Answer?: Array<{ data?: string }>;
}

const DOMAIN_CACHE_KEY = 'brandfinder.domainCache.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const domainCache = new Map<string, DomainVerificationResult>();
let cacheHydrated = false;

function hydrateDomainCache(): void {
  if (cacheHydrated || typeof window === 'undefined') return;
  cacheHydrated = true;
  try {
    const raw = localStorage.getItem(DOMAIN_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, DomainVerificationResult>;
    const now = Date.now();
    for (const [domain, item] of Object.entries(parsed)) {
      const age = now - new Date(item.checkedAt).getTime();
      if (item.status !== 'unknown' && age < CACHE_TTL_MS) {
        domainCache.set(domain, { ...item, fromCache: true });
      }
    }
  } catch {
    // Ignore malformed localStorage cache
  }
}

function persistDomainCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Array.from(domainCache.entries()).slice(-400);
    localStorage.setItem(
      DOMAIN_CACHE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Ignore storage quota errors
  }
}

function parseRdapMeta(body: RdapResponse): {
  registrar?: string;
  registeredAt?: string;
} {
  let registrar: string | undefined;
  let registeredAt: string | undefined;

  for (const entity of body.entities ?? []) {
    if (!entity.roles?.includes('registrar') || !entity.vcardArray) continue;
    for (const field of entity.vcardArray[1] ?? []) {
      if (field[0] === 'fn' && typeof field[3] === 'string') {
        registrar = field[3];
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

async function queryRdapClient(
  domain: string,
  tld: string,
): Promise<DomainVerificationResult | null> {
  const endpoint =
    tld === 'com' || tld === 'net'
      ? `https://rdap.verisign.com/${tld}/v1/domain/${domain}`
      : `https://rdap.org/domain/${domain}`;

  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/rdap+json, application/json' },
    });

    const checkedAt = new Date().toISOString();
    const method =
      tld === 'com' || tld === 'net' ? 'rdap-verisign' : 'rdap-iana';

    if (res.status === 404) {
      return {
        domain,
        tld,
        status: 'available',
        verificationMethod: method,
        checkedAt,
        fromCache: false,
      };
    }

    if (res.ok) {
      const body = (await res.json()) as RdapResponse;
      const meta = parseRdapMeta(body);
      return {
        domain,
        tld,
        status: 'taken',
        verificationMethod: method,
        registrar: meta.registrar,
        registeredAt: meta.registeredAt,
        checkedAt,
        fromCache: false,
      };
    }
  } catch {
    // Fall back to DNS-over-HTTPS below
  }

  return null;
}

async function queryGoogleDoh(
  domain: string,
  tld: string,
): Promise<DomainVerificationResult> {
  const checkedAt = new Date().toISOString();
  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = (await res.json()) as DohResponse;
      if (data.Status === 0 && (data.Answer?.length ?? 0) > 0) {
        return {
          domain,
          tld,
          status: 'taken',
          verificationMethod: 'dns-delegation',
          checkedAt,
          fromCache: false,
        };
      }
      if (data.Status === 3) {
        return {
          domain,
          tld,
          status: 'available',
          verificationMethod: 'dns-delegation',
          checkedAt,
          fromCache: false,
        };
      }
    }
  } catch {
    // Network unreachable
  }

  return {
    domain,
    tld,
    status: 'unknown',
    verificationMethod: 'network-error',
    checkedAt,
    fromCache: false,
  };
}

async function verifyDomainStatic(
  word: string,
  tld: string,
  forceRefresh = false,
): Promise<DomainVerificationResult> {
  hydrateDomainCache();
  const cleanWord = normalizeBrandWord(word);
  const domain = `${cleanWord}.${tld}`;

  if (!forceRefresh) {
    const cached = domainCache.get(domain);
    if (cached) return cached;
  }

  const rdap = await queryRdapClient(domain, tld);
  const result = rdap ?? (await queryGoogleDoh(domain, tld));

  if (result.status !== 'unknown') {
    domainCache.set(domain, result);
    persistDomainCache();
  }

  return result;
}

async function verifyCandidateStatic(
  entry: RawLexiconEntry,
  forceRefresh: boolean,
): Promise<BrandCandidate> {
  const cleanWord = normalizeBrandWord(entry.word);
  const phonetics = analyzePhonetics(cleanWord);
  const [domainResult, quickMeaning] = await Promise.all([
    verifyDomainStatic(cleanWord, 'com', forceRefresh),
    entry.meaning
      ? Promise.resolve(entry.meaning)
      : lookupLiveDefinitionQuick(cleanWord),
  ]);

  return {
    word: cleanWord,
    displayName: toTitleCase(cleanWord),
    domain: domainResult.domain,
    status: domainResult.status,
    verificationMethod: domainResult.verificationMethod,
    registrar: domainResult.registrar,
    registeredAt: domainResult.registeredAt,
    checkedAt: domainResult.checkedAt,
    length: cleanWord.length,
    syllables: phonetics.syllables,
    startsWith: phonetics.startsWith,
    ending: phonetics.ending,
    smoothnessScore: phonetics.smoothnessScore,
    pronunciationHint: phonetics.pronunciationHint,
    source: entry.source,
    languageOrigin: entry.languageOrigin,
    meaning: quickMeaning ?? entry.meaning,
  };
}

async function selectStaticSlice(params: DiscoveryFilterParams): Promise<{
  slice: RawLexiconEntry[];
  totalMatchingPool: number;
}> {
  let pool: RawLexiconEntry[] = [];

  switch (params.source) {
    case 'world-dictionary':
      pool = await fetchLiveWorldDictionaryWords(params);
      break;
    case 'multilingual-roots':
      pool = loadMultilingualLexicon();
      break;
    case 'phonetic-formula':
      pool = generatePhoneticFormulaPool(
        params.startsWith,
        params.conceptQuery,
      );
      break;
  }

  const startFilter = params.startsWith.toLowerCase();
  const customEnd = params.customEnding
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const contains = params.containsText
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const minLen = params.exactLength ?? Math.max(3, params.minLength);
  const maxLen = params.exactLength ?? Math.max(minLen, params.maxLength);

  const filtered = pool.filter((entry) => {
    const word = entry.word;
    if (word.length < minLen || word.length > maxLen) return false;
    if (startFilter !== 'all' && !word.startsWith(startFilter)) return false;
    if (customEnd && !word.endsWith(customEnd)) return false;
    if (!matchesEndingCategory(word, params.endingCategory)) return false;
    if (contains && !word.includes(contains)) return false;

    if (params.onlySmoothPronunciation || params.minSmoothness > 0) {
      const profile = analyzePhonetics(word);
      if (params.onlySmoothPronunciation && !profile.isSmoothMotherBrand) {
        return false;
      }
      if (profile.smoothnessScore < params.minSmoothness) {
        return false;
      }
    }
    return true;
  });

  const safeOffset = Math.max(0, params.offset);
  const safeBatch = Math.max(5, Math.min(250, params.batchSize));

  let ordered = filtered;
  if (params.wordOrder === 'uncommon-first') {
    ordered = [...filtered].reverse();
  } else if (params.wordOrder === 'alphabetical') {
    ordered = [...filtered].sort((a, b) => a.word.localeCompare(b.word));
  }

  return {
    slice: ordered.slice(safeOffset, safeOffset + safeBatch),
    totalMatchingPool: ordered.length,
  };
}

export async function getStaticDictionaryStats(): Promise<DictionaryStatsResponse> {
  hydrateDomainCache();
  return {
    worldDictionaryCount: 1000,
    multilingualRootsCount: loadMultilingualLexicon().length,
    cachedDomainsCount: domainCache.size,
    liveApiConnected: true,
  };
}

export async function streamStaticBrandDiscovery(
  params: DiscoveryFilterParams,
  signal: AbortSignal,
  onEvent: (event: DiscoveryStreamEvent) => void,
): Promise<void> {
  const { slice, totalMatchingPool } = await selectStaticSlice(params);
  let scannedCount = 0;
  let availableCount = 0;
  let takenCount = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (!signal.aborted && cursor < slice.length) {
      const idx = cursor;
      cursor += 1;
      const entry = slice[idx];
      if (!entry) break;

      const candidate = await verifyCandidateStatic(
        entry,
        Boolean(params.forceRefresh),
      );
      if (signal.aborted) return;

      scannedCount += 1;
      if (candidate.status === 'available') {
        availableCount += 1;
      } else if (candidate.status === 'taken') {
        takenCount += 1;
      }

      onEvent({ type: 'candidate', candidate });
      onEvent({
        type: 'progress',
        scannedCount,
        totalBatchCandidates: slice.length,
        availableCount,
        takenCount,
        currentWord: entry.word,
      });
    }
  };

  const concurrency = Math.min(6, Math.max(1, slice.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (!signal.aborted) {
    onEvent({
      type: 'done',
      scannedCount,
      availableCount,
      takenCount,
      nextOffset: params.offset + slice.length,
      totalMatchingPool,
    });
  }
}

export async function runStaticQuickDomainCheck(
  words: string[],
  forceRefresh = false,
): Promise<QuickCheckResponse> {
  const uniqueWords = Array.from(
    new Set(
      words
        .map((w) => normalizeBrandWord(w))
        .filter((w) => w.length >= 2 && w.length <= 32),
    ),
  ).slice(0, 300);

  const results: BrandCandidate[] = new Array(uniqueWords.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < uniqueWords.length) {
      const idx = cursor;
      cursor += 1;
      const word = uniqueWords[idx];
      if (!word) break;

      results[idx] = await verifyCandidateStatic(
        {
          word,
          source: 'world-dictionary',
          languageOrigin: 'Direct Team Check',
        },
        forceRefresh,
      );
    }
  };

  const concurrency = Math.min(6, Math.max(1, uniqueWords.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const valid = results.filter(Boolean);
  return {
    results: valid,
    availableCount: valid.filter((r) => r.status === 'available').length,
    takenCount: valid.filter((r) => r.status === 'taken').length,
  };
}

export async function inspectStaticBrandCandidate(
  word: string,
): Promise<BrandInspectionResponse> {
  const cleanWord = normalizeBrandWord(word);
  const tldList = ['com', 'io', 'ai', 'dev', 'co', 'org', 'net', 'xyz'];

  const [tlds, dictInfo] = await Promise.all([
    Promise.all(tldList.map((tld) => verifyDomainStatic(cleanWord, tld, false))),
    lookupFreeDictionaryDetails(cleanWord),
  ]);

  return {
    word: cleanWord,
    tlds,
    phoneticIpa: dictInfo.phoneticIpa,
    originNote: dictInfo.originNote,
    definitions: dictInfo.definitions,
  };
}

export function buildStaticPdfReportBlob(payload: ExportReportPayload): Blob {
  const bytes = generateBrandReportPdf(payload);
  return new Blob([bytes], { type: 'application/pdf' });
}

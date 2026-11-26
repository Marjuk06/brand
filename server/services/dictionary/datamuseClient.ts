import type {
  DictionaryDefinitionItem,
  DiscoveryFilterParams,
  RawLexiconEntry,
} from '../../../src/types/brand.ts';

interface DatamuseApiItem {
  word: string;
  score?: number;
  tags?: string[];
  defs?: string[];
}

interface FreeDictDefinition {
  definition: string;
}

interface FreeDictMeaning {
  partOfSpeech: string;
  definitions: FreeDictDefinition[];
}

interface FreeDictEntry {
  word: string;
  phonetic?: string;
  origin?: string;
  meanings?: FreeDictMeaning[];
}

const definitionCache = new Map<string, string>();

function buildDatamuseSpellingPattern(params: DiscoveryFilterParams): string {
  const start =
    params.startsWith !== 'all' && /^[a-z]$/.test(params.startsWith)
      ? params.startsWith
      : '';
  const end = params.customEnding.trim().toLowerCase().replace(/[^a-z]/g, '');

  if (params.exactLength !== null) {
    const fixedChars = start.length + end.length;
    const middleSlots = Math.max(0, params.exactLength - fixedChars);
    return `${start}${'?'.repeat(middleSlots)}${end}`;
  }

  if (start && end) return `${start}*${end}`;
  if (start) return `${start}*`;
  if (end) return `*${end}`;
  return '*';
}

export async function fetchLiveWorldDictionaryWords(
  params: DiscoveryFilterParams,
): Promise<RawLexiconEntry[]> {
  const url = new URL('https://api.datamuse.com/words');
  const concept = params.conceptQuery.trim();
  const pattern = buildDatamuseSpellingPattern(params);

  if (concept) {
    url.searchParams.set('ml', concept);
  }
  if (pattern !== '*') {
    url.searchParams.set('sp', pattern);
  } else if (!concept) {
    // When user leaves both start and concept open, query clean common-to-rare English words
    url.searchParams.set('sp', '????*');
  }

  url.searchParams.set('md', 'df');
  url.searchParams.set('max', '1000');

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as DatamuseApiItem[];
    const results: RawLexiconEntry[] = [];
    const seen = new Set<string>();

    for (const item of payload) {
      const clean = item.word.trim().toLowerCase();
      if (!/^[a-z]{3,15}$/.test(clean) || seen.has(clean)) continue;
      seen.add(clean);

      let parsedMeaning: string | undefined;
      if (item.defs && item.defs.length > 0) {
        parsedMeaning = item.defs[0].replace(/^[a-z]+\t/, '').trim();
        definitionCache.set(clean, parsedMeaning);
      }

      results.push({
        word: clean,
        source: 'world-dictionary',
        languageOrigin: concept
          ? `WordNet Live ("${concept}")`
          : 'WordNet Live Dictionary',
        meaning: parsedMeaning,
      });
    }

    return results;
  } catch {
    return [];
  }
}

export async function lookupLiveDefinitionQuick(
  word: string,
): Promise<string | undefined> {
  const clean = word.trim().toLowerCase();
  const cached = definitionCache.get(clean);
  if (cached) return cached;

  try {
    const url = new URL('https://api.datamuse.com/words');
    url.searchParams.set('sp', clean);
    url.searchParams.set('md', 'd');
    url.searchParams.set('max', '1');

    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const items = (await res.json()) as DatamuseApiItem[];
      const exact = items.find((i) => i.word.toLowerCase() === clean);
      if (exact?.defs?.[0]) {
        const def = exact.defs[0].replace(/^[a-z]+\t/, '').trim();
        definitionCache.set(clean, def);
        return def;
      }
    }
  } catch {
    // Non-fatal
  }

  return undefined;
}

export async function lookupFreeDictionaryDetails(word: string): Promise<{
  phoneticIpa?: string;
  originNote?: string;
  definitions: DictionaryDefinitionItem[];
}> {
  const clean = word.trim().toLowerCase();
  if (!/^[a-z]+$/.test(clean)) {
    return { definitions: [] };
  }

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`,
      {
        signal: AbortSignal.timeout(4000),
        headers: { Accept: 'application/json' },
      },
    );

    if (!response.ok) {
      return { definitions: [] };
    }

    const data = (await response.json()) as FreeDictEntry[];
    if (!Array.isArray(data) || data.length === 0) {
      return { definitions: [] };
    }

    const first = data[0];
    const definitions: DictionaryDefinitionItem[] = [];

    for (const meaning of first.meanings ?? []) {
      for (const def of meaning.definitions.slice(0, 2)) {
        definitions.push({
          partOfSpeech: meaning.partOfSpeech,
          definition: def.definition,
        });
      }
    }

    return {
      phoneticIpa: first.phonetic,
      originNote: first.origin,
      definitions: definitions.slice(0, 5),
    };
  } catch {
    return { definitions: [] };
  }
}

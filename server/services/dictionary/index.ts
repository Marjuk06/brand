import type {
  DiscoveryFilterParams,
  RawLexiconEntry,
} from '../../../src/types/brand.ts';
import {
  analyzePhonetics,
  matchesEndingCategory,
} from '../phonetics/brandScorer.ts';
import {
  getSystemDictionaryCount,
  loadSystemDictionary,
} from './localDictionary.ts';
import { loadMultilingualLexicon } from './multilingualLexicon.ts';
import { generatePhoneticFormulaPool } from './phoneticGenerator.ts';
import { fetchLiveWorldDictionaryWords } from './datamuseClient.ts';

export interface CandidateSlice {
  slice: RawLexiconEntry[];
  totalMatchingPool: number;
}

async function buildWorldDictionaryPool(
  params: DiscoveryFilterParams,
): Promise<RawLexiconEntry[]> {
  // Fetch live WordNet entries first, then append OS dictionary words for deep paging
  const [liveWords, systemWords] = await Promise.all([
    fetchLiveWorldDictionaryWords(params),
    params.conceptQuery.trim() ? Promise.resolve([]) : loadSystemDictionary(),
  ]);

  if (systemWords.length === 0) {
    return liveWords;
  }

  const seen = new Set(liveWords.map((w) => w.word));
  const merged = [...liveWords];
  for (const sys of systemWords) {
    if (!seen.has(sys.word)) {
      seen.add(sys.word);
      merged.push(sys);
    }
  }
  return merged;
}

export async function selectCandidateSlice(
  params: DiscoveryFilterParams,
): Promise<CandidateSlice> {
  let pool: RawLexiconEntry[] = [];

  switch (params.source) {
    case 'world-dictionary':
      pool = await buildWorldDictionaryPool(params);
      break;
    case 'multilingual-roots':
      pool = loadMultilingualLexicon();
      break;
    case 'phonetic-formula':
      pool = generatePhoneticFormulaPool(params.startsWith, params.conceptQuery);
      break;
  }

  const startFilter = params.startsWith.toLowerCase();
  const customEnd = params.customEnding.trim().toLowerCase().replace(/[^a-z]/g, '');
  const contains = params.containsText.trim().toLowerCase().replace(/[^a-z]/g, '');

  const minLen = params.exactLength ?? Math.max(3, params.minLength);
  const maxLen = params.exactLength ?? Math.max(minLen, params.maxLength);

  const filtered = pool.filter((entry) => {
    const word = entry.word;

    if (word.length < minLen || word.length > maxLen) {
      return false;
    }

    if (startFilter !== 'all' && !word.startsWith(startFilter)) {
      return false;
    }

    if (customEnd && !word.endsWith(customEnd)) {
      return false;
    }

    if (!matchesEndingCategory(word, params.endingCategory)) {
      return false;
    }

    if (contains && !word.includes(contains)) {
      return false;
    }

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

export { getSystemDictionaryCount, loadMultilingualLexicon };

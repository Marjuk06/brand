import type { RawLexiconEntry } from '../../../src/types/brand.ts';
import { normalizeBrandWord } from '../phonetics/brandScorer.ts';

const INITIAL_CONSONANTS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
];

const CORE_VOWELS = ['a', 'e', 'i', 'o', 'u'];

// Smooth bridges modeled after Google, Sony, Oracle, Lumel, Marquesis, Heptagram
const SMOOTH_BRIDGES = [
  'l', 'r', 'n', 'm', 'v', 's', 'z', 't', 'd', 'k', 'g', 'p', 'b',
  'lm', 'lv', 'lr', 'nr', 'nv', 'rm', 'rv', 'rn', 'sl', 'vr', 'qu', 'pt', 'ct',
  'lum', 'vel', 'mar', 'ori', 'nav', 'sol', 'kal', 'zen', 'mir', 'tav', 'riv', 'hep',
];

// Marjuk's formula endings + Google/Marquesis/Heptagram smooth endings
const FORMULA_ENDINGS = [
  'le', 'el', 'al', 'io', 'o', 'a', 'is', 'es', 'sis',
  'un', 'on', 'an', 'm', 'um', 'gram', 'ra', 'ro', 'lo', 'la', 'no', 'na',
];

export function generateSeedMutations(seedRaw: string): RawLexiconEntry[] {
  const seed = normalizeBrandWord(seedRaw);
  if (seed.length < 3) return [];

  const seen = new Set<string>();
  const out: RawLexiconEntry[] = [];

  const add = (word: string, note: string): void => {
    if (word.length < 4 || word.length > 13 || seen.has(word)) return;
    seen.add(word);
    out.push({
      word,
      source: 'phonetic-formula',
      languageOrigin: 'Google-Style Seed Mutation',
      meaning: note,
    });
  };

  // 1. Google-style ending swap (googol -> google, marquis -> marquesis, heptagon -> heptagram)
  const stem = seed.replace(/(?:ol|on|us|is|um|an|en|in|er|or|ar|ic|al|le|el|[aeiou])+$/, '');
  if (stem.length >= 2) {
    for (const ending of FORMULA_ENDINGS) {
      add(`${stem}${ending}`, `Smooth ending mutation of "${seed}"`);
      for (const v of ['a', 'e', 'i', 'o']) {
        add(`${stem}${v}${ending}`, `Harmonic vowel bridge from "${seed}"`);
      }
    }
  }

  // 2. Vowel shift mutations (preserving consonant skeleton)
  for (let i = 0; i < seed.length; i += 1) {
    if (CORE_VOWELS.includes(seed[i])) {
      for (const v of CORE_VOWELS) {
        if (v !== seed[i]) {
          const mutated = seed.slice(0, i) + v + seed.slice(i + 1);
          add(mutated, `Phonetic vowel Respelling of "${seed}"`);
        }
      }
    }
  }

  // 3. Initial letter substitution (exploring A-Z around a sound like "google" -> "loogle")
  const tail = seed.slice(1);
  for (const ch of INITIAL_CONSONANTS) {
    if (!CORE_VOWELS.includes(ch) && ch !== seed[0]) {
      add(`${ch}${tail}`, `Initial consonant play on "${seed}"`);
    }
  }

  return out;
}

let cachedFormulaPool: RawLexiconEntry[] | null = null;

export function generatePhoneticFormulaPool(
  startsWithFilter: string,
  seedQuery: string,
): RawLexiconEntry[] {
  if (seedQuery.trim().length >= 3) {
    return generateSeedMutations(seedQuery);
  }

  if (!cachedFormulaPool) {
    const seen = new Set<string>();
    const generated: RawLexiconEntry[] = [];

    for (const start of INITIAL_CONSONANTS) {
      const startIsVowel = CORE_VOWELS.includes(start);

      if (startIsVowel) {
        for (const bridge of SMOOTH_BRIDGES) {
          for (const end of FORMULA_ENDINGS) {
            const word = `${start}${bridge}${end}`;
            if (word.length >= 4 && word.length <= 11 && !seen.has(word)) {
              seen.add(word);
              generated.push({
                word,
                source: 'phonetic-formula',
                languageOrigin: 'Phonetic Formula (V+C+End)',
                meaning: `Formula: ${start.toUpperCase()} + ${bridge} + -${end}`,
              });
            }
          }
        }
      } else {
        const startPair = start === 'q' ? ['qu'] : CORE_VOWELS.map((v) => `${start}${v}`);
        for (const cv of startPair) {
          for (const bridge of SMOOTH_BRIDGES.slice(0, 22)) {
            for (const end of FORMULA_ENDINGS) {
              const needsBridgeVowel =
                !CORE_VOWELS.includes(end[0]) && !CORE_VOWELS.includes(bridge[bridge.length - 1]);
              const word = needsBridgeVowel ? `${cv}${bridge}o${end}` : `${cv}${bridge}${end}`;
              if (word.length >= 4 && word.length <= 11 && !seen.has(word)) {
                seen.add(word);
                generated.push({
                  word,
                  source: 'phonetic-formula',
                  languageOrigin: 'Phonetic Formula (C+V+End)',
                  meaning: `Formula: ${cv.toUpperCase()} + ${bridge} + -${end}`,
                });
              }
            }
          }
        }
      }
    }

    cachedFormulaPool = generated;
  }

  if (startsWithFilter !== 'all') {
    return cachedFormulaPool.filter((entry) => entry.word.startsWith(startsWithFilter));
  }

  return cachedFormulaPool;
}

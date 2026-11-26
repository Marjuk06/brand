import type { EndingCategory, PhoneticProfile } from '../../../src/types/brand.ts';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

const ALLOWED_TRIPLE_CONSONANTS = new Set([
  'str', 'spr', 'scr', 'spl', 'chr', 'phr', 'thr', 'shr',
  'chl', 'sch', 'ndr', 'ngl', 'ngr', 'mpl', 'mpr', 'ntr',
  'ncl', 'ncr', 'ptg', 'rqu', 'lph', 'rch', 'rth', 'rst',
]);

const HARSH_ENDINGS = [
  'xk', 'vq', 'zj', 'pf', 'ck', 'dg', 'tch', 'ght', 'zz', 'xx', 'qq',
];

const SMOOTH_LIQUID_ENDINGS = [
  'le', 'el', 'al', 'il', 'ol', 'ul',
  'lo', 'la', 'li', 'lu',
  'ra', 'ro', 'ri', 'no', 'na', 'ni',
];

const VOWEL_O_ENDINGS = ['io', 'eo', 'lo', 'no', 'ro', 'mo', 'vo', 'so', 'to', 'o'];
const VOWEL_A_ENDINGS = ['ia', 'ea', 'ra', 'la', 'na', 'ma', 'va', 'sa', 'ta', 'a'];
const CLASSICAL_IS_ENDINGS = ['sis', 'tis', 'lis', 'ris', 'nis', 'vis', 'is', 'es', 'us', 'os'];
const CLASSICAL_GRAM_ENDINGS = ['gram', 'graph', 'gon', 'ium', 'eum', 'um', 'om', 'am', 'em'];
const NASAL_ENDINGS = ['un', 'on', 'an', 'en', 'in', 'm', 'n'];

const INFLECTION_PENALTY_ENDINGS = [
  'ing', 'ed', 'ly', 'ness', 'ment', 'tion', 'sion', 'able', 'ible', 'iest', 'ier',
];

export function toTitleCase(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function normalizeBrandWord(raw: string): string {
  const withoutDomain = raw.trim().toLowerCase().replace(/\.[a-z.]+$/, '');
  return withoutDomain.replace(/[^a-z]/g, '');
}

export function countSyllables(word: string): number {
  const clean = word.toLowerCase();
  if (clean.length <= 3) return 1;

  let count = 0;
  let prevVowel = false;

  for (let i = 0; i < clean.length; i += 1) {
    const isVowel = VOWELS.has(clean[i]);
    if (isVowel && !prevVowel) {
      count += 1;
    }
    prevVowel = isVowel;
  }

  // Silent trailing 'e' unless preceded by consonant + 'l' (as in "google", "apple", "oracle")
  if (clean.endsWith('e') && !clean.endsWith('le') && !clean.endsWith('ee') && count > 1) {
    count -= 1;
  }

  return Math.max(1, count);
}

export function detectEnding(word: string): string {
  const knownSuffixes = [
    'gram', 'graph', 'sis', 'tis', 'ium', 'gon',
    'le', 'el', 'al', 'io', 'ia', 'is', 'es', 'us', 'os',
    'un', 'on', 'an', 'ra', 'ro', 'lo', 'la', 'no', 'na', 'um',
    'o', 'a', 'e', 'i', 'u', 'm', 'n', 'l', 'r',
  ];

  for (const suffix of knownSuffixes) {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
      return suffix;
    }
  }

  return word.slice(-2);
}

export function matchesEndingCategory(word: string, category: EndingCategory): boolean {
  const matchList = (list: string[]): boolean =>
    list.some((suffix) => word.endsWith(suffix));

  switch (category) {
    case 'any':
      return true;
    case 'smooth-liquid':
      return matchList(SMOOTH_LIQUID_ENDINGS);
    case 'vowel-o':
      return matchList(VOWEL_O_ENDINGS);
    case 'vowel-a':
      return matchList(VOWEL_A_ENDINGS);
    case 'classical-is':
      return matchList(CLASSICAL_IS_ENDINGS);
    case 'classical-gram':
      return matchList(CLASSICAL_GRAM_ENDINGS);
    case 'nasal-un-m':
      return matchList(NASAL_ENDINGS);
  }
}

function hasAwkwardConsonantCluster(word: string): boolean {
  let streak = '';
  for (const ch of word) {
    if (!VOWELS.has(ch)) {
      streak += ch;
      if (streak.length === 3 && !ALLOWED_TRIPLE_CONSONANTS.has(streak)) {
        return true;
      }
      if (streak.length >= 4) {
        return true;
      }
    } else {
      streak = '';
    }
  }
  return false;
}

export function buildPronunciationHint(word: string): string {
  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < word.length; i += 1) {
    current += word[i];
    const ch = word[i];
    const next = word[i + 1];
    const afterNext = word[i + 2];

    if (
      VOWELS.has(ch) &&
      next &&
      !VOWELS.has(next) &&
      afterNext &&
      VOWELS.has(afterNext) &&
      current.length >= 2
    ) {
      chunks.push(current);
      current = '';
    }
  }

  if (current) {
    if (chunks.length > 0 && current.length === 1 && !VOWELS.has(current)) {
      chunks[chunks.length - 1] += current;
    } else {
      chunks.push(current);
    }
  }

  if (chunks.length === 0) return word.toUpperCase();
  chunks[0] = chunks[0].toUpperCase();
  return chunks.join('-');
}

export function analyzePhonetics(word: string): PhoneticProfile {
  const syllables = countSyllables(word);
  const ending = detectEnding(word);
  const startsWith = word.charAt(0);

  let score = 45;

  if (word.length >= 4 && word.length <= 7) {
    score += 20;
  } else if (word.length >= 8 && word.length <= 9) {
    score += 14;
  } else if (word.length === 3 || word.length === 10) {
    score += 8;
  }

  if (syllables === 2 || syllables === 3) {
    score += 18;
  } else if (syllables === 4 && word.length <= 9) {
    score += 10;
  }

  const isSmoothEnding =
    matchesEndingCategory(word, 'smooth-liquid') ||
    matchesEndingCategory(word, 'vowel-o') ||
    matchesEndingCategory(word, 'vowel-a') ||
    matchesEndingCategory(word, 'classical-is') ||
    matchesEndingCategory(word, 'classical-gram');

  if (isSmoothEnding) {
    score += 16;
  }

  let vowelCount = 0;
  for (const ch of word) {
    if (VOWELS.has(ch)) vowelCount += 1;
  }
  const ratio = vowelCount / word.length;
  if (ratio >= 0.34 && ratio <= 0.62) {
    score += 10;
  } else if (ratio < 0.22 || ratio > 0.75) {
    score -= 18;
  }

  const awkward = hasAwkwardConsonantCluster(word);
  if (awkward) {
    score -= 28;
  }

  if (HARSH_ENDINGS.some((h) => word.endsWith(h))) {
    score -= 20;
  }

  const hasInflection = INFLECTION_PENALTY_ENDINGS.some(
    (inf) => word.length > inf.length + 2 && word.endsWith(inf),
  );
  if (hasInflection) {
    score -= 12;
  }

  const clamped = Math.max(5, Math.min(99, score));

  return {
    syllables,
    startsWith,
    ending,
    smoothnessScore: clamped,
    isSmoothMotherBrand: clamped >= 65 && !awkward && vowelCount >= 1,
    pronunciationHint: buildPronunciationHint(word),
  };
}

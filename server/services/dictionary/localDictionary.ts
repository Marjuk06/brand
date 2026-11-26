import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { RawLexiconEntry } from '../../../src/types/brand.ts';
import { analyzePhonetics } from '../phonetics/brandScorer.ts';

const SYSTEM_DICTIONARY_PATHS = [
  '/usr/share/dict/american-english',
  '/usr/share/dict/british-english',
  '/usr/share/dict/words',
];

interface IndexedWord {
  word: string;
  smoothness: number;
}

let cachedEntries: RawLexiconEntry[] | null = null;

export async function loadSystemDictionary(): Promise<RawLexiconEntry[]> {
  if (cachedEntries) return cachedEntries;

  const uniqueLower = new Set<string>();

  for (const dictPath of SYSTEM_DICTIONARY_PATHS) {
    if (!existsSync(dictPath)) continue;
    try {
      const content = await readFile(dictPath, 'utf-8');
      const lines = content.split(/\r?\n/);

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (trimmed.length < 3 || trimmed.length > 15) continue;
        // Skip uppercase acronyms and proper nouns when filtering pure dictionary roots
        if (trimmed === trimmed.toUpperCase() && trimmed.length <= 6) continue;
        if (!/^[a-z]+$/.test(trimmed)) continue;

        uniqueLower.add(trimmed);
      }
    } catch {
      // Skip unreadable dictionary file
    }
  }

  const scoredList: IndexedWord[] = [];
  for (const word of uniqueLower) {
    const profile = analyzePhonetics(word);
    scoredList.push({ word, smoothness: profile.smoothnessScore });
  }

  scoredList.sort((a, b) => b.smoothness - a.smoothness || a.word.localeCompare(b.word));

  cachedEntries = scoredList.map((item) => ({
    word: item.word,
    source: 'world-dictionary',
    languageOrigin: 'System English Dictionary',
  }));

  return cachedEntries;
}

export async function getSystemDictionaryCount(): Promise<number> {
  const entries = await loadSystemDictionary();
  return entries.length;
}

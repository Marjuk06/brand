export type DomainStatus = 'available' | 'taken' | 'unknown';

export type VerificationMethod =
  | 'dns-delegation'
  | 'rdap-verisign'
  | 'whois-verisign'
  | 'rdap-iana'
  | 'whois-iana'
  | 'network-error';

export type LexiconSource =
  | 'world-dictionary'
  | 'multilingual-roots'
  | 'phonetic-formula';

export type EndingCategory =
  | 'any'
  | 'smooth-liquid'
  | 'vowel-o'
  | 'vowel-a'
  | 'classical-is'
  | 'classical-gram'
  | 'nasal-un-m';

export interface RawLexiconEntry {
  word: string;
  source: LexiconSource;
  languageOrigin: string;
  meaning?: string;
}

export interface PhoneticProfile {
  syllables: number;
  startsWith: string;
  ending: string;
  smoothnessScore: number;
  isSmoothMotherBrand: boolean;
  pronunciationHint: string;
}

export interface DomainVerificationResult {
  domain: string;
  tld: string;
  status: DomainStatus;
  verificationMethod: VerificationMethod;
  registrar?: string;
  registeredAt?: string;
  checkedAt: string;
  fromCache: boolean;
}

export interface BrandCandidate {
  word: string;
  displayName: string;
  domain: string;
  status: DomainStatus;
  verificationMethod: VerificationMethod;
  registrar?: string;
  registeredAt?: string;
  checkedAt: string;
  length: number;
  syllables: number;
  startsWith: string;
  ending: string;
  smoothnessScore: number;
  pronunciationHint: string;
  source: LexiconSource;
  languageOrigin: string;
  meaning?: string;
}

export type WordOrder = 'common-first' | 'uncommon-first' | 'alphabetical';

export interface DiscoveryFilterParams {
  source: LexiconSource;
  startsWith: string;
  exactLength: number | null;
  minLength: number;
  maxLength: number;
  endingCategory: EndingCategory;
  customEnding: string;
  containsText: string;
  conceptQuery: string;
  wordOrder: WordOrder;
  minSmoothness: number;
  onlySmoothPronunciation: boolean;
  batchSize: number;
  offset: number;
  forceRefresh?: boolean;
}

export interface DiscoveryStreamProgressEvent {
  type: 'progress';
  scannedCount: number;
  totalBatchCandidates: number;
  availableCount: number;
  takenCount: number;
  currentWord: string;
}

export interface DiscoveryStreamCandidateEvent {
  type: 'candidate';
  candidate: BrandCandidate;
}

export interface DiscoveryStreamDoneEvent {
  type: 'done';
  scannedCount: number;
  availableCount: number;
  takenCount: number;
  nextOffset: number;
  totalMatchingPool: number;
}

export interface DiscoveryStreamErrorEvent {
  type: 'error';
  message: string;
}

export type DiscoveryStreamEvent =
  | DiscoveryStreamProgressEvent
  | DiscoveryStreamCandidateEvent
  | DiscoveryStreamDoneEvent
  | DiscoveryStreamErrorEvent;

export interface QuickCheckRequest {
  words: string[];
  forceRefresh?: boolean;
}

export interface QuickCheckResponse {
  results: BrandCandidate[];
  availableCount: number;
  takenCount: number;
}

export interface DictionaryDefinitionItem {
  partOfSpeech: string;
  definition: string;
}

export interface BrandInspectionResponse {
  word: string;
  tlds: DomainVerificationResult[];
  phoneticIpa?: string;
  originNote?: string;
  definitions: DictionaryDefinitionItem[];
}

export interface DictionaryStatsResponse {
  worldDictionaryCount: number;
  multilingualRootsCount: number;
  cachedDomainsCount: number;
  liveApiConnected: boolean;
}

export interface ExportReportPayload {
  title: string;
  filterSummary: string;
  candidates: BrandCandidate[];
}

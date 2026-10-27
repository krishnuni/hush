export type BookFormat = 'epub' | 'pdf';
export type ThemeName = 'warm' | 'light' | 'night';
export type ReadingStatus = 'new' | 'reading' | 'finished';

export interface Preferences {
  theme: ThemeName;
  font: 'serif' | 'sans' | 'publisher';
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  margin: number;
}
export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'warm',
  font: 'serif',
  fontSize: 19,
  lineHeight: 1.6,
  contentWidth: 680,
  margin: 40,
};

export interface EpubLocator {
  kind: 'epub';
  cfi: string;
  href: string;
  quote?: string;
  section: number;
  progress?: number;
}
export interface PdfLocator {
  kind: 'pdf';
  page: number;
  scale: number;
  rotation: number;
  y: number;
  progress: number;
}
export type Locator = EpubLocator | PdfLocator;
export interface Bookmark {
  id: string;
  label: string;
  locator: Locator;
  createdAt: number;
}
export interface ListeningPosition {
  sentenceId: string;
  locator: Locator;
  offset: number;
  textHash: string;
  engineKey: string;
  clipKey?: string;
  speed?: number;
  volume?: number;
}
export interface BookEntry {
  id: string;
  hash: string;
  title: string;
  author: string;
  filename: string;
  format: BookFormat;
  byteSize: number;
  cover?: string;
  addedAt: number;
  openedAt?: number;
  status: ReadingStatus;
  locator?: Locator;
  listening?: ListeningPosition;
  bookmarks: Bookmark[];
  preferences?: Preferences;
  sample?: boolean;
}
export interface Chapter {
  id: string;
  label: string;
  href: string;
  level: number;
}
export interface SpokenSentence {
  id: string;
  text: string;
  locator: Locator;
  highlightLocator?: Locator;
  textStart?: number;
  textEnd?: number;
}
export interface ReaderHandle {
  next(): void;
  previous(): void;
  goTo(locator: Locator | string | number): Promise<void>;
  getSentences(): SpokenSentence[];
  nextPassage(after: SpokenSentence, signal: AbortSignal): Promise<SpokenSentence[] | null>;
  highlight(sentence: SpokenSentence | null): void;
}
export interface ReaderUpdate {
  locator: Locator;
  chapter: string;
  pageLabel: string;
}
export interface NarrationStatus {
  available: boolean;
  engine: string;
  reason?: string;
  engineKey?: string;
}
export interface LibraryRepository {
  list(): Promise<BookEntry[]>;
  insert(entry: BookEntry, data: Uint8Array): Promise<void>;
  update(entry: BookEntry): Promise<void>;
  remove(id: string): Promise<void>;
  read(id: string): Promise<Uint8Array>;
  getPreferences(): Promise<Preferences>;
  setPreferences(prefs: Preferences): Promise<void>;
  narrationStatus(): Promise<NarrationStatus>;
  synthesize(text: string, signal: AbortSignal): Promise<Blob>;
  kind: 'browser' | 'native';
}

export function boundPreferences(value: Partial<Preferences>): Preferences {
  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  return {
    theme: ['warm', 'light', 'night'].includes(value.theme ?? '') ? value.theme! : 'warm',
    font: ['serif', 'sans', 'publisher'].includes(value.font ?? '') ? value.font! : 'serif',
    fontSize: clamp(value.fontSize, 16, 32, 19),
    lineHeight: clamp(value.lineHeight, 1.35, 1.95, 1.6),
    contentWidth: clamp(value.contentWidth, 480, 900, 680),
    margin: clamp(value.margin, 16, 96, 40),
  };
}

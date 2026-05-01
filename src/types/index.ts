export type ModelId = 'haiku' | 'sonnet' | 'opus';
export type AnalysisState = 'pending' | 'analyzing' | 'completed' | 'failed';
export type SubtitleMode = 'jp' | 'jp+en' | 'en';
export type DictName = 'jmdict' | 'jmnedict';

export interface RetimerState {
  offsetMs: number;
  scaleFactor: number;
  isSynced: boolean;
}

export const DEFAULT_RETIMER: RetimerState = {
  offsetMs: 0,
  scaleFactor: 1,
  isSynced: false,
};

export interface LibraryEntry {
  id: string;
  title: string;
  seriesName: string | null;
  episodeNumber: number | null;
  thumbnailPath: string;
  durationSeconds: number;
  videoAspectRatio: number;
  dateAddedISO: string;
  lastWatchedISO: string | null;
  watchProgressPercent: number;
  retimerState: RetimerState;
  analysisState: AnalysisState;
  analysisError: string | null;
  modelUsed: ModelId | null;
  videoUri: string;
  subtitleUri: string;
  analysisDataPath: string;
}

export function isWatched(entry: LibraryEntry): boolean {
  return entry.watchProgressPercent > 70;
}

export interface Token {
  surface: string;
  reading: string;
  lemma: string;
  pos: string;
  charStart: number;
  charEnd: number;
}

export interface DictMatch {
  tokenSpan: [number, number];
  form: string;
  source: 'surface' | 'lemma';
  dict: DictName;
  entryIds: number[];
}

export interface Cue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  tokens: Token[];
  matchesByTokenIndex: Record<number, DictMatch[]>;
  translation: string;
  grammarNote: string | null;
}

export interface AnalysisData {
  cues: Cue[];
}

export interface SavedWord {
  id: string;
  surface: string;
  reading: string;
  shortDefinition: string;
  cueText: string;
  sourceEntryId: string;
  sourceCueIndex: number;
  dictEntryIds: number[];
  dict: DictName;
  dateSavedISO: string;
}

export interface AppSettings {
  modelId: ModelId;
  autoPauseAtLineEnd: boolean;
  defaultSubtitleMode: SubtitleMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  modelId: 'haiku',
  autoPauseAtLineEnd: false,
  defaultSubtitleMode: 'jp',
};

export interface AnkiSettings {
  ankiConnectUrl: string;
  defaultDeckName: string;
  audioPaddingBeforeMs: number;
  audioPaddingAfterMs: number;
}

export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  ankiConnectUrl: 'http://127.0.0.1:8765',
  defaultDeckName: 'Pureyaa',
  audioPaddingBeforeMs: 500,
  audioPaddingAfterMs: 500,
};

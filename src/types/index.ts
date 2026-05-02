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
  /** OpenRouter model slug recorded at analysis time (e.g. anthropic/claude-sonnet-4.5). */
  modelUsed: string | null;
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
  autoPauseAtLineEnd: boolean;
  defaultSubtitleMode: SubtitleMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoPauseAtLineEnd: false,
  defaultSubtitleMode: 'jp',
};

export type AudioMode = 'original' | 'tts' | 'none';

export interface AnkiSettings {
  defaultDeckName: string;
  audioPaddingBeforeMs: number;
  audioPaddingAfterMs: number;
  audioMode: AudioMode;
  ttsVoice: string;
}

export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  // The native bridge auto-creates the deck on first send, so any name
  // works — Pureyaa is the obvious default for this app.
  defaultDeckName: 'Pureyaa',
  audioPaddingBeforeMs: 500,
  audioPaddingAfterMs: 500,
  audioMode: 'original',
  // OpenAI gpt-4o-audio-preview voices via OpenRouter. Nova handles
  // Japanese reasonably well — warm female timbre with decent prosody.
  ttsVoice: 'nova',
};

export const TTS_VOICES: { id: string; label: string }[] = [
  { id: 'nova', label: 'Nova (F, warm)' },
  { id: 'shimmer', label: 'Shimmer (F, bright)' },
  { id: 'coral', label: 'Coral (F, lively)' },
  { id: 'sage', label: 'Sage (F, thoughtful)' },
  { id: 'alloy', label: 'Alloy (neutral)' },
  { id: 'echo', label: 'Echo (M, baritone)' },
  { id: 'fable', label: 'Fable (M, British)' },
  { id: 'onyx', label: 'Onyx (M, deep)' },
  { id: 'ash', label: 'Ash (M, crisp)' },
  { id: 'ballad', label: 'Ballad (M, soft)' },
];

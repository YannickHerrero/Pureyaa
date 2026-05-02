import { File } from 'expo-file-system';
import type { AnalysisData, Cue } from '@/types';
import { parseSrt } from './srt';
import { getTokenizer, tokenize } from './tokenize';
import { buildMatches } from './match';
import { loadDictionaries } from './dict';
import { translateCues } from './llm';

export type ProgressEvent =
  | { phase: 'tokenizing'; processed: number; total: number }
  | {
      phase: 'translating';
      translated: number;
      total: number;
      latestText: string;
    };

export interface TokenizeOptions {
  subtitleUri: string;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (text: string) => void;
  signal?: AbortSignal;
}

export interface TranslateAnalysisOptions {
  apiKey: string;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (text: string) => void;
  signal?: AbortSignal;
}

export async function tokenizeSubtitles(opts: TokenizeOptions): Promise<AnalysisData> {
  const { subtitleUri, onProgress, onLog, signal } = opts;
  const log = (s: string) => onLog?.(s);

  log('reading + parsing SRT');
  const srtText = await new File(subtitleUri).text();
  const rawCues = parseSrt(srtText);
  if (rawCues.length === 0) {
    throw new Error('No cues found in subtitle file.');
  }
  log(`parsed ${rawCues.length} cues`);

  log('loading JMdict + JMnedict bundles');
  await loadDictionaries();
  log('dictionaries ready');

  log('warming up kuromoji tokenizer');
  await getTokenizer((m) => log(`kuromoji: ${m}`));

  log(`tokenizing ${rawCues.length} cues`);
  const cues: Cue[] = [];
  for (let i = 0; i < rawCues.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const rc = rawCues[i];
    const tokens = await tokenize(rc.text);
    const matches = buildMatches(tokens);
    cues.push({
      index: rc.index,
      startMs: rc.startMs,
      endMs: rc.endMs,
      text: rc.text,
      tokens,
      matchesByTokenIndex: matches,
      translation: '',
      grammarNote: null,
    });
    onProgress?.({ phase: 'tokenizing', processed: i + 1, total: rawCues.length });
  }
  log('tokenization complete');
  return { cues };
}

export async function addTranslations(
  data: AnalysisData,
  opts: TranslateAnalysisOptions,
): Promise<void> {
  const { apiKey, onProgress, onLog, signal } = opts;
  const log = (s: string) => onLog?.(s);

  log(`requesting translation from OpenRouter (${data.cues.length} lines)`);
  const byIndex = new Map<number, Cue>(data.cues.map((c) => [c.index, c]));
  let translatedCount = 0;
  await translateCues({
    apiKey,
    cues: data.cues.map((c) => ({ index: c.index, text: c.text })),
    signal,
    onLog: log,
    onItem: (item) => {
      const target = byIndex.get(item.index);
      if (!target) return;
      target.translation = item.translation;
      target.grammarNote = item.grammarNote;
      translatedCount += 1;
      if (translatedCount === 1) log('first translation received');
      onProgress?.({
        phase: 'translating',
        translated: translatedCount,
        total: data.cues.length,
        latestText: item.translation,
      });
    },
  });
  log(`translation complete (${translatedCount}/${data.cues.length} cues)`);
}

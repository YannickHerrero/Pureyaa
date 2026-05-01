import { File } from 'expo-file-system';
import type { AnalysisData, Cue, ModelId } from '@/types';
import { parseSrt } from './srt';
import { getTokenizer, tokenize } from './tokenize';
import { buildMatches } from './match';
import { loadDictionaries } from './dict';
import { translateCues } from './claude';

export type ProgressEvent =
  | { phase: 'tokenizing'; processed: number; total: number }
  | {
      phase: 'translating';
      translated: number;
      total: number;
      latestText: string;
    };

export interface AnalyzeOptions {
  subtitleUri: string;
  apiKey: string;
  model: ModelId;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (text: string) => void;
  signal?: AbortSignal;
}

export async function runAnalysis(opts: AnalyzeOptions): Promise<AnalysisData> {
  const { subtitleUri, apiKey, model, onProgress, onLog, signal } = opts;
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

  log(`requesting translation from Claude (${cues.length} lines)`);
  const byIndex = new Map<number, Cue>(cues.map((c) => [c.index, c]));
  let translatedCount = 0;
  await translateCues({
    apiKey,
    model,
    cues: cues.map((c) => ({ index: c.index, text: c.text })),
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
        total: cues.length,
        latestText: item.translation,
      });
    },
  });
  log(`translation complete (${translatedCount}/${cues.length} cues)`);

  return { cues };
}

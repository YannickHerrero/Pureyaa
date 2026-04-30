import { File } from 'expo-file-system';
import type { AnalysisData, Cue, ModelId } from '@/types';
import { parseSrt } from './srt';
import { tokenize } from './tokenize';
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
  signal?: AbortSignal;
}

export async function runAnalysis(opts: AnalyzeOptions): Promise<AnalysisData> {
  const { subtitleUri, apiKey, model, onProgress, signal } = opts;

  // Step 1: read + parse SRT
  const srtText = await new File(subtitleUri).text();
  const rawCues = parseSrt(srtText);
  if (rawCues.length === 0) {
    throw new Error('No cues found in subtitle file.');
  }

  // Step 2: load dictionaries (idempotent)
  await loadDictionaries();

  // Step 3: tokenize + match every cue
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

  // Step 4: translate via Claude (streaming)
  const byIndex = new Map<number, Cue>(cues.map((c) => [c.index, c]));
  let translatedCount = 0;
  await translateCues({
    apiKey,
    model,
    cues: cues.map((c) => ({ index: c.index, text: c.text })),
    signal,
    onItem: (item) => {
      const target = byIndex.get(item.index);
      if (!target) return;
      target.translation = item.translation;
      target.grammarNote = item.grammarNote;
      translatedCount += 1;
      onProgress?.({
        phase: 'translating',
        translated: translatedCount,
        total: cues.length,
        latestText: item.translation,
      });
    },
  });

  if (translatedCount === 0) {
    throw new Error('LLM returned no translations.');
  }

  return { cues };
}

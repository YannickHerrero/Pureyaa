import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  addTranslations,
  tokenizeSubtitles,
  type ProgressEvent,
} from '@/analysis/orchestrator';
import { getOpenRouterApiKey, getSettings } from '@/storage/settings';
import { ANALYSIS_MODEL } from '@/analysis/llm';
import { FileAccess, withSession } from 'file-access';
import {
  analysisPathFor,
  thumbnailPathFor,
  upsertEntry,
  writeAnalysisData,
} from '@/storage/entries';
import { extractThumbnail } from '@/utils/thumbnail';
import type { AnalysisData, AppSettings, LibraryEntry } from '@/types';
import { DEFAULT_RETIMER } from '@/types';
import { uuid } from '@/utils/uuid';

type Phase =
  | 'idle'
  | 'tokenizing'
  | 'translating'
  | 'translation-failed'
  | 'finalizing'
  | 'done'
  | 'failed';

interface LogEntry {
  ts: number;
  text: string;
}

interface ProgressState {
  phase: Phase;
  tokenized: number;
  tokenizedTotal: number;
  translated: number;
  translatedTotal: number;
  latestText: string;
  error: string | null;
  logs: LogEntry[];
}

const INITIAL: ProgressState = {
  phase: 'idle',
  tokenized: 0,
  tokenizedTotal: 0,
  translated: 0,
  translatedTotal: 0,
  latestText: '',
  error: null,
  logs: [],
};

export default function AnalyzeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    videoUri: string;
    videoName: string;
    subtitleUri: string;
    subtitleName: string;
    title: string;
    seriesName: string;
    episodeNumber: string;
  }>();
  const [state, setState] = useState<ProgressState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const partialDataRef = useRef<AnalysisData | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);

  const finalize = async (data: AnalysisData, settings: AppSettings) => {
    setState((s) => ({ ...s, phase: 'finalizing' }));

    const id = uuid();
    const analysisDataPath = await analysisPathFor(id);
    await writeAnalysisData(analysisDataPath, data);

    const thumbPath = await thumbnailPathFor(id);
    let thumbnailPath = thumbPath;
    let aspectRatio = 16 / 9;
    let durationSeconds = 0;
    try {
      const lastCueEndMs = data.cues[data.cues.length - 1]?.endMs ?? 0;
      const positionMs = Math.max(0, Math.floor(lastCueEndMs * 0.1));
      const t = await withSession(params.videoUri, (url) =>
        extractThumbnail(url, thumbPath, positionMs),
      );
      thumbnailPath = t.uri;
      aspectRatio = t.width > 0 && t.height > 0 ? t.width / t.height : aspectRatio;
      durationSeconds = Math.ceil(lastCueEndMs / 1000);
    } catch {
      // proceed with defaults
    }

    // Defensive re-persist: pickVideo took permission on the URI it got
    // back from the picker, but expo-router URL-encodes URIs into the
    // navigation state — params.videoUri here may have a slightly
    // different encoding than the original. Re-take permission on the
    // exact string we're about to save into the entry. On Android this
    // is takePersistableUriPermission again (idempotent on the canonical
    // form). On iOS the input is a bookmark blob; the native module
    // detects that and no-ops.
    try {
      await FileAccess.persistFileAccess(params.videoUri);
    } catch {
      // bridge swallows already; ignore here too.
    }

    const ep = parseInt(params.episodeNumber ?? '', 10);
    const entry: LibraryEntry = {
      id,
      title: params.title,
      seriesName: (params.seriesName ?? '').length > 0 ? params.seriesName : null,
      episodeNumber: Number.isFinite(ep) ? ep : null,
      thumbnailPath,
      durationSeconds,
      videoAspectRatio: aspectRatio,
      dateAddedISO: new Date().toISOString(),
      lastWatchedISO: null,
      watchProgressPercent: 0,
      retimerState: { ...DEFAULT_RETIMER },
      analysisState: 'completed',
      analysisError: null,
      modelUsed: ANALYSIS_MODEL,
      videoUri: params.videoUri,
      subtitleUri: params.subtitleUri,
      analysisDataPath,
    };
    await upsertEntry(entry);

    setState((s) => ({ ...s, phase: 'done' }));
    setTimeout(() => router.replace('/library'), 600);
  };

  const start = async () => {
    const startTs = Date.now();
    setState({ ...INITIAL, phase: 'tokenizing' });
    const ctl = new AbortController();
    abortRef.current = ctl;
    partialDataRef.current = null;
    try {
      const apiKey = await getOpenRouterApiKey();
      if (!apiKey) throw new Error('Missing OpenRouter API key. Set it in Settings.');
      const settings = await getSettings();
      settingsRef.current = settings;

      const onLog = (text: string) => {
        const ts = (Date.now() - startTs) / 1000;
        console.log(`[analyze ${ts.toFixed(1)}s] ${text}`);
        setState((s) => ({ ...s, logs: [...s.logs, { ts, text }] }));
      };
      const onProgress = (e: ProgressEvent) => {
        setState((s) => {
          if (e.phase === 'tokenizing') {
            return {
              ...s,
              phase: 'tokenizing',
              tokenized: e.processed,
              tokenizedTotal: e.total,
            };
          }
          return {
            ...s,
            phase: 'translating',
            translated: e.translated,
            translatedTotal: e.total,
            latestText: e.latestText,
          };
        });
      };

      const data = await tokenizeSubtitles({
        subtitleUri: params.subtitleUri,
        signal: ctl.signal,
        onLog,
        onProgress,
      });
      partialDataRef.current = data;

      try {
        await addTranslations(data, {
          apiKey,
          signal: ctl.signal,
          onLog,
          onProgress,
        });
      } catch (e) {
        const err = e as Error;
        console.error('[analyze] translation failed:', err);
        if (err.stack) console.error(err.stack);
        setState((s) => ({
          ...s,
          phase: 'translation-failed',
          error: err.message,
        }));
        return;
      }

      await finalize(data, settings);
    } catch (e) {
      setState((s) => ({ ...s, phase: 'failed', error: (e as Error).message }));
    }
  };

  const onSkipTranslation = async () => {
    const data = partialDataRef.current;
    const settings = settingsRef.current;
    if (!data || !settings) return;
    try {
      await finalize(data, settings);
    } catch (e) {
      setState((s) => ({ ...s, phase: 'failed', error: (e as Error).message }));
    }
  };

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Analyzing', headerShown: true }} />
      <View style={styles.content}>
        <PhaseRow
          label="Tokenizing subtitles"
          active={state.phase === 'tokenizing'}
          done={
            state.phase === 'translating' ||
            state.phase === 'finalizing' ||
            state.phase === 'done'
          }
          progress={state.tokenizedTotal > 0 ? state.tokenized / state.tokenizedTotal : 0}
          right={
            state.tokenizedTotal > 0
              ? `${state.tokenized} / ${state.tokenizedTotal}`
              : ''
          }
        />
        <PhaseRow
          label="Translating with Claude"
          active={state.phase === 'translating'}
          done={state.phase === 'finalizing' || state.phase === 'done'}
          progress={
            state.translatedTotal > 0 ? state.translated / state.translatedTotal : 0
          }
          right={
            state.translatedTotal > 0
              ? `${state.translated} / ${state.translatedTotal} lines`
              : ''
          }
          subText={state.latestText}
        />
        {state.phase === 'finalizing' && (
          <Text style={styles.finalize}>Saving entry…</Text>
        )}
        {state.phase === 'done' && (
          <Text style={styles.success}>Done.</Text>
        )}
        {state.phase === 'failed' && state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Analysis failed</Text>
            <Text style={styles.errorBody}>{state.error}</Text>
            <Pressable style={styles.retry} onPress={start}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}
        {state.phase === 'translation-failed' && state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Translation failed</Text>
            <Text style={styles.errorBody}>{state.error}</Text>
            <Text style={styles.errorHint}>
              You can save the entry with tokenization only — translations will be empty.
            </Text>
            <View style={styles.buttonRow}>
              <Pressable style={styles.retry} onPress={start}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
              <Pressable style={[styles.retry, styles.skip]} onPress={onSkipTranslation}>
                <Text style={styles.retryText}>Save without translations</Text>
              </Pressable>
            </View>
          </View>
        )}
        <DebugLog logs={state.logs} />
      </View>
    </View>
  );
}

function DebugLog({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<ScrollView | null>(null);
  return (
    <View style={styles.debug}>
      <Text style={styles.debugTitle}>Debug log</Text>
      <ScrollView
        ref={scrollRef}
        style={styles.debugScroll}
        contentContainerStyle={styles.debugContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {logs.length === 0 ? (
          <Text style={styles.debugEmpty}>(waiting for events)</Text>
        ) : (
          logs.map((l, i) => (
            <Text key={i} style={styles.debugLine}>
              <Text style={styles.debugTs}>{l.ts.toFixed(1).padStart(5, ' ')}s </Text>
              {l.text}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function PhaseRow({
  label,
  active,
  done,
  progress,
  right,
  subText,
}: {
  label: string;
  active: boolean;
  done: boolean;
  progress: number;
  right: string;
  subText?: string;
}) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={styles.phase}>
      <View style={styles.phaseHead}>
        <Text style={[styles.phaseLabel, !(active || done) && styles.phaseDim]}>
          {done ? '✓ ' : ''}
          {label}
        </Text>
        <View style={styles.phaseRight}>
          {active && <ActivityIndicator color="#888" size="small" />}
          <Text style={styles.phaseRightText}>{right}</Text>
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
      </View>
      {subText ? (
        <Text style={styles.subText} numberOfLines={1}>
          {subText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { padding: 24, gap: 24 },
  phase: { gap: 8 },
  phaseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phaseLabel: { color: '#fff', fontSize: 15, fontWeight: '500' },
  phaseDim: { color: '#666' },
  phaseRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseRightText: { color: '#888', fontSize: 13 },
  bar: { height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#3b82f6' },
  subText: { color: '#666', fontSize: 12 },
  finalize: { color: '#888', textAlign: 'center', marginTop: 8 },
  success: { color: '#4ade80', textAlign: 'center', marginTop: 8, fontSize: 16 },
  errorBox: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 16,
    borderColor: '#7f1d1d',
    borderWidth: 1,
    gap: 12,
  },
  errorTitle: { color: '#f87171', fontWeight: '600', fontSize: 16 },
  errorBody: { color: '#ddd', fontSize: 13 },
  retry: {
    alignSelf: 'flex-start',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  errorHint: { color: '#aaa', fontSize: 13, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  skip: { backgroundColor: '#374151' },
  debug: {
    marginTop: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    borderColor: '#222',
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  debugTitle: { color: '#888', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  debugScroll: { maxHeight: 200 },
  debugContent: { gap: 2 },
  debugEmpty: { color: '#444', fontSize: 12, fontStyle: 'italic' },
  debugLine: { color: '#9ca3af', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  debugTs: { color: '#6b7280' },
});

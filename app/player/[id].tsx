import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, useVideoPlayer } from 'expo-video';
import { usePlayerData } from '@/player/playerStore';
import { SubtitlePane } from '@/player/SubtitlePane';
import { DictPopup } from '@/player/DictPopup';
import { Controls } from '@/player/Controls';
import { RetimerModal } from '@/player/RetimerModal';
import { effectiveEndMs, findCueIndexAt } from '@/utils/time';
import { getSettings } from '@/storage/settings';
import { loadDictionaries } from '@/analysis/dict';
import { upsertEntry } from '@/storage/entries';
import type { Cue, RetimerState, SubtitleMode } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = usePlayerData(id!);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  if (result.state === 'loading') {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (result.state === 'error') {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ headerShown: true, title: 'Error' }} />
        <Text style={styles.errorText}>{result.message}</Text>
      </View>
    );
  }
  return <Player data={result.data} />;
}

function Player({ data }: { data: ReturnType<typeof usePlayerData> extends infer R ? Extract<R, { state: 'ready' }>['data'] : never }) {
  const { width: screenWidth } = useWindowDimensions();
  const { entry, analysis } = data;
  const cues = analysis.cues;

  const player = useVideoPlayer(entry.videoUri, (p) => {
    p.loop = false;
    p.muted = false;
    p.timeUpdateEventInterval = 0.1;
  });

  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<SubtitleMode>(DEFAULT_SETTINGS.defaultSubtitleMode);
  const [autoPause, setAutoPause] = useState<boolean>(DEFAULT_SETTINGS.autoPauseAtLineEnd);
  const [popup, setPopup] = useState<{ cue: Cue; tokenIndex: number } | null>(null);
  const [retimerOpen, setRetimerOpen] = useState(false);
  const [retimer, setRetimer] = useState<RetimerState>(entry.retimerState);
  const lastAutoPausedCueIndex = useRef<number>(-1);

  const onApplyRetimer = async (next: RetimerState) => {
    setRetimer(next);
    await upsertEntry({ ...entry, retimerState: next });
  };

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setMode(s.defaultSubtitleMode);
      setAutoPause(s.autoPauseAtLineEnd);
      await loadDictionaries();
    })();
  }, []);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', (e) => {
      setCurrentMs(Math.round(e.currentTime * 1000));
    });
    const subPlaying = player.addListener('playingChange', (e) => {
      setIsPlaying(e.isPlaying);
    });
    const subStatus = player.addListener('statusChange', () => {
      const d = player.duration;
      if (Number.isFinite(d) && d > 0) setDurationMs(Math.round(d * 1000));
    });
    return () => {
      sub.remove();
      subPlaying.remove();
      subStatus.remove();
    };
  }, [player]);

  const aspect = entry.videoAspectRatio > 0 ? entry.videoAspectRatio : 16 / 9;
  const videoHeight = screenWidth / aspect;

  const currentCueIndex = useMemo(
    () => findCueIndexAt(cues, currentMs, retimer),
    [cues, currentMs, retimer],
  );
  const currentCue = currentCueIndex >= 0 ? cues[currentCueIndex] : null;

  useEffect(() => {
    if (!autoPause || !isPlaying || !currentCue) return;
    const endMs = effectiveEndMs(currentCue, retimer);
    if (currentMs >= endMs - 30 && lastAutoPausedCueIndex.current !== currentCueIndex) {
      lastAutoPausedCueIndex.current = currentCueIndex;
      player.pause();
    }
  }, [autoPause, isPlaying, currentCue, currentCueIndex, currentMs, retimer, player]);

  useEffect(() => {
    // Cue changed (seek, natural progression). Clear the latch so the new
    // cue can auto-pause when its own end is reached.
    lastAutoPausedCueIndex.current = -1;
  }, [currentCueIndex]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.videoArea, { width: screenWidth, height: videoHeight }]}>
        <VideoView
          style={{ width: '100%', height: '100%' }}
          player={player}
          contentFit="contain"
          nativeControls={false}
        />
      </View>
      <View style={styles.subtitleArea}>
        <SubtitlePane
          cue={currentCue}
          mode={mode}
          onTokenPress={(cue, tokenIndex) => {
            player.pause();
            setPopup({ cue, tokenIndex });
          }}
        />
      </View>
      <Controls
        isPlaying={isPlaying}
        currentMs={currentMs}
        durationMs={durationMs > 0 ? durationMs : entry.durationSeconds * 1000}
        cues={cues}
        retimer={retimer}
        currentCueIndex={currentCueIndex}
        onPlayPause={() => (isPlaying ? player.pause() : player.play())}
        onSeekMs={(ms) => {
          player.currentTime = ms / 1000;
        }}
        onOpenRetimer={() => {
          player.pause();
          setRetimerOpen(true);
        }}
      />
      <RetimerModal
        visible={retimerOpen}
        currentMs={currentMs}
        retimer={retimer}
        onApply={onApplyRetimer}
        onClose={() => setRetimerOpen(false)}
      />
      <DictPopup
        visible={popup !== null}
        cue={popup?.cue ?? null}
        tokenIndex={popup?.tokenIndex ?? 0}
        sourceEntryId={entry.id}
        onClose={() => setPopup(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#f87171', padding: 16 },
  videoArea: { backgroundColor: '#000' },
  subtitleArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, useVideoPlayer } from 'expo-video';
import { usePlayerData } from '@/player/playerStore';
import { findCueIndexAt } from '@/utils/time';
import type { Cue, RetimerState } from '@/types';

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
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', (e) => {
      setCurrentMs(Math.round(e.currentTime * 1000));
    });
    const subPlaying = player.addListener('playingChange', (e) => {
      setIsPlaying(e.isPlaying);
    });
    return () => {
      sub.remove();
      subPlaying.remove();
    };
  }, [player]);

  const aspect = entry.videoAspectRatio > 0 ? entry.videoAspectRatio : 16 / 9;
  const videoHeight = screenWidth / aspect;

  const currentCueIndex = useMemo(
    () => findCueIndexAt(cues, currentMs, entry.retimerState),
    [cues, currentMs, entry.retimerState],
  );
  const currentCue = currentCueIndex >= 0 ? cues[currentCueIndex] : null;

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
        <SubtitlePane cue={currentCue} retimer={entry.retimerState} />
      </View>
      <BasicControls player={player} isPlaying={isPlaying} />
    </View>
  );
}

function SubtitlePane({ cue }: { cue: Cue | null; retimer: RetimerState }) {
  if (!cue) {
    return (
      <View style={styles.cueBox}>
        <Text style={styles.placeholder}>—</Text>
      </View>
    );
  }
  return (
    <View style={styles.cueBox}>
      <Text style={styles.cueText}>{cue.text}</Text>
      {cue.translation ? <Text style={styles.translation}>{cue.translation}</Text> : null}
    </View>
  );
}

function BasicControls({
  player,
  isPlaying,
}: {
  player: ReturnType<typeof useVideoPlayer>;
  isPlaying: boolean;
}) {
  const lastTap = useRef(0);
  return (
    <Pressable
      style={styles.controls}
      onPress={() => {
        const now = Date.now();
        if (now - lastTap.current < 300) return;
        lastTap.current = now;
        if (isPlaying) player.pause();
        else player.play();
      }}
    >
      <Text style={styles.controlText}>{isPlaying ? 'Pause' : 'Play'}</Text>
    </Pressable>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cueBox: { gap: 8 },
  cueText: { color: '#fff', fontSize: 22, lineHeight: 32 },
  translation: { color: '#aaa', fontSize: 15, lineHeight: 22 },
  placeholder: { color: '#444' },
  controls: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
  },
  controlText: { color: '#fff', fontWeight: '600' },
});

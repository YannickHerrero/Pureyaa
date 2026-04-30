import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { Cue, RetimerState } from '@/types';
import { effectiveStartMs } from '@/utils/time';
import { formatHMS } from '@/utils/time';

export interface ControlsProps {
  isPlaying: boolean;
  currentMs: number;
  durationMs: number;
  cues: Cue[];
  retimer: RetimerState;
  currentCueIndex: number;
  onPlayPause: () => void;
  onSeekMs: (ms: number) => void;
  onOpenRetimer?: () => void;
}

export function Controls(props: ControlsProps) {
  const {
    isPlaying,
    currentMs,
    durationMs,
    cues,
    retimer,
    currentCueIndex,
    onPlayPause,
    onSeekMs,
    onOpenRetimer,
  } = props;
  const [scrubMs, setScrubMs] = useState<number | null>(null);

  useEffect(() => {
    setScrubMs(null);
  }, [currentMs]);

  const total = Math.max(1, durationMs);
  const displayMs = scrubMs ?? currentMs;
  const pct = Math.max(0, Math.min(1, displayMs / total));

  const onPrev = () => {
    if (currentCueIndex < 0) return;
    const cur = cues[currentCueIndex];
    const startMs = effectiveStartMs(cur, retimer);
    if (currentMs - startMs > 1000 || currentCueIndex === 0) {
      onSeekMs(startMs);
    } else {
      const prev = cues[currentCueIndex - 1];
      onSeekMs(effectiveStartMs(prev, retimer));
    }
  };

  const onReplay = () => {
    if (currentCueIndex < 0) return;
    onSeekMs(effectiveStartMs(cues[currentCueIndex], retimer));
  };

  const onNext = () => {
    if (currentCueIndex < 0 || currentCueIndex >= cues.length - 1) return;
    onSeekMs(effectiveStartMs(cues[currentCueIndex + 1], retimer));
  };

  return (
    <View style={styles.bar}>
      <View style={styles.scrubRow}>
        <Text style={styles.time}>{formatHMS(displayMs / 1000)}</Text>
        <ScrubBar
          progress={pct}
          onScrub={(p) => setScrubMs(Math.round(p * total))}
          onScrubEnd={(p) => onSeekMs(Math.round(p * total))}
        />
        <Text style={styles.time}>{formatHMS(durationMs / 1000)}</Text>
      </View>
      <View style={styles.btnRow}>
        <CtlButton label="‹‹" onPress={onPrev} />
        <CtlButton label="↺" onPress={onReplay} />
        <CtlButton label={isPlaying ? '❚❚' : '▶'} onPress={onPlayPause} primary />
        <CtlButton label="››" onPress={onNext} />
        {onOpenRetimer ? <CtlButton label="sync" onPress={onOpenRetimer} small /> : null}
      </View>
    </View>
  );
}

function ScrubBar({
  progress,
  onScrub,
  onScrubEnd,
}: {
  progress: number;
  onScrub: (p: number) => void;
  onScrubEnd: (p: number) => void;
}) {
  const [width, setWidth] = useState(0);

  return (
    <View
      style={styles.scrub}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderMove={(e) => {
        if (width === 0) return;
        const x = Math.max(0, Math.min(width, e.nativeEvent.locationX));
        onScrub(x / width);
      }}
      onResponderRelease={(e) => {
        if (width === 0) return;
        const x = Math.max(0, Math.min(width, e.nativeEvent.locationX));
        onScrubEnd(x / width);
      }}
    >
      <View style={styles.scrubTrack}>
        <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function CtlButton({
  label,
  onPress,
  primary,
  small,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.btn, primary && styles.btnPrimary, small && styles.btnSmall]}
    >
      <Text style={[styles.btnText, small && styles.btnTextSmall]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { color: '#bbb', fontSize: 12, minWidth: 44, textAlign: 'center' },
  scrub: { flex: 1, height: 28, justifyContent: 'center' },
  scrubTrack: { height: 4, backgroundColor: '#333', borderRadius: 2 },
  scrubFill: { height: 4, backgroundColor: '#3b82f6', borderRadius: 2 },
  btnRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14 },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: '#3b82f6' },
  btnSmall: { width: 60, height: 32, borderRadius: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnTextSmall: { fontSize: 12 },
});

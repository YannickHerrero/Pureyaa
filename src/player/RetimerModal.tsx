import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import type { RetimerState } from '@/types';
import {
  computeFromOnePoint,
  computeFromTwoPoints,
  resetRetimer,
  type SyncPoint,
} from '@/utils/retimer';
import { formatHMS } from '@/utils/time';
import {
  addRecentRetimer,
  getRecentRetimers,
  type RecentRetimer,
} from '@/storage/recentRetimers';

export interface RetimerModalProps {
  visible: boolean;
  currentMs: number;
  retimer: RetimerState;
  onApply: (next: RetimerState) => void;
  onClose: () => void;
}

interface DraftPoint {
  textTimeMs: number | null;
  audioTimeMs: number | null;
}

const EMPTY: DraftPoint = { textTimeMs: null, audioTimeMs: null };

export function RetimerModal(props: RetimerModalProps) {
  const { visible, currentMs, retimer, onApply, onClose } = props;
  const [stage, setStage] = useState<1 | 2>(1);
  const [p1, setP1] = useState<DraftPoint>(EMPTY);
  const [p2, setP2] = useState<DraftPoint>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentRetimer[]>([]);

  useEffect(() => {
    if (!visible) return;
    getRecentRetimers().then(setRecents).catch(() => {});
  }, [visible]);

  const reset = () => {
    setStage(1);
    setP1(EMPTY);
    setP2(EMPTY);
    setError(null);
  };

  const tap = (which: 'text' | 'audio') => {
    setError(null);
    const target = stage === 1 ? p1 : p2;
    const setTarget = stage === 1 ? setP1 : setP2;
    setTarget({
      ...target,
      [which === 'text' ? 'textTimeMs' : 'audioTimeMs']: currentMs,
    });
  };

  const applyAndRemember = (next: RetimerState) => {
    onApply(next);
    addRecentRetimer(next.offsetMs, next.scaleFactor).catch(() => {});
    reset();
    onClose();
  };

  const applyRecent = (r: RecentRetimer) => {
    applyAndRemember({
      offsetMs: r.offsetMs,
      scaleFactor: r.scaleFactor,
      isSynced: true,
    });
  };

  const applyOnePoint = () => {
    if (p1.textTimeMs == null || p1.audioTimeMs == null) {
      setError('Capture both Text and Audio for sync point 1.');
      return;
    }
    const next = computeFromOnePoint({ textTimeMs: p1.textTimeMs, audioTimeMs: p1.audioTimeMs });
    applyAndRemember(next);
  };

  const applyTwoPoints = () => {
    if (
      p1.textTimeMs == null ||
      p1.audioTimeMs == null ||
      p2.textTimeMs == null ||
      p2.audioTimeMs == null
    ) {
      setError('Capture both Text and Audio for both sync points.');
      return;
    }
    const a: SyncPoint = { textTimeMs: p1.textTimeMs, audioTimeMs: p1.audioTimeMs };
    const b: SyncPoint = { textTimeMs: p2.textTimeMs, audioTimeMs: p2.audioTimeMs };
    const next = computeFromTwoPoints(a, b);
    if (!next) {
      setError('Sync point 2 must be meaningfully later than point 1.');
      return;
    }
    applyAndRemember(next);
  };

  const onResetSync = () => {
    onApply(resetRetimer());
    reset();
  };

  const draft = stage === 1 ? p1 : p2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.popup} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Subtitle retimer</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {recents.length > 0 && (
            <View style={styles.recentBlock}>
              <Text style={styles.recentTitle}>Recent</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}
              >
                {recents.map((r, i) => (
                  <Pressable
                    key={i}
                    style={styles.recentPill}
                    onPress={() => applyRecent(r)}
                  >
                    <Text style={styles.recentText}>{formatRecent(r)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Text style={styles.stage}>Sync point {stage} of 2</Text>
          <Text style={styles.help}>
            Tap Text when the subtitle appears on screen. Tap Audio when the line is spoken.
          </Text>

          <View style={styles.row}>
            <CaptureButton
              label="Text"
              capturedMs={draft.textTimeMs}
              onPress={() => tap('text')}
            />
            <CaptureButton
              label="Audio"
              capturedMs={draft.audioTimeMs}
              onPress={() => tap('audio')}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {stage === 1 ? (
            <View style={styles.actions}>
              <Pressable style={styles.button} onPress={applyOnePoint}>
                <Text style={styles.buttonText}>Apply (offset only)</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.buttonAlt]} onPress={() => setStage(2)}>
                <Text style={styles.buttonText}>Add second sync point</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.button} onPress={applyTwoPoints}>
                <Text style={styles.buttonText}>Apply (offset + scale)</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.buttonAlt]} onPress={() => setStage(1)}>
                <Text style={styles.buttonText}>Back</Text>
              </Pressable>
            </View>
          )}

          {retimer.isSynced && (
            <Pressable style={styles.resetRow} onPress={onResetSync}>
              <Text style={styles.resetText}>Reset to original timings</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CaptureButton({
  label,
  capturedMs,
  onPress,
}: {
  label: string;
  capturedMs: number | null;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.capture} onPress={onPress}>
      <Text style={styles.captureLabel}>{label}</Text>
      <Text style={styles.captureValue}>
        {capturedMs == null ? '—' : formatHMS(capturedMs / 1000)}
      </Text>
    </Pressable>
  );
}

function formatRecent(r: RecentRetimer): string {
  const sec = r.offsetMs / 1000;
  const sign = sec > 0 ? '+' : sec < 0 ? '−' : '';
  let label = `${sign}${Math.abs(sec).toFixed(2)}s`;
  if (Math.abs(r.scaleFactor - 1) > 1e-6) {
    label += ` × ${r.scaleFactor.toFixed(3)}`;
  }
  return label;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  popup: {
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  close: { color: '#888', fontSize: 18, padding: 4 },
  stage: { color: '#aaa', fontSize: 14, fontWeight: '500' },
  help: { color: '#888', fontSize: 13 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  capture: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  captureLabel: { color: '#aaa', fontSize: 13 },
  captureValue: { color: '#fff', fontSize: 18, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  buttonAlt: { backgroundColor: '#374151' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resetRow: { alignItems: 'center', marginTop: 8 },
  resetText: { color: '#f87171', fontSize: 13, textDecorationLine: 'underline' },
  error: { color: '#f87171', fontSize: 13, marginTop: 4 },
  recentBlock: { gap: 6 },
  recentTitle: { color: '#888', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  recentRow: { gap: 8, paddingRight: 12 },
  recentPill: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  recentText: { color: '#fff', fontSize: 13, fontVariant: ['tabular-nums'] },
});

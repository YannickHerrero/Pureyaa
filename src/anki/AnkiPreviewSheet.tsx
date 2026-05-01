import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AnkiSettings, Cue, DictName, LibraryEntry } from '@/types';
import type { DictEntry } from '@/analysis/dict';
import { AnkiClient } from './client';
import { buildCardAssets, cleanupCardAssets, type CardAssets } from './buildCard';
import { sendCardToAnki } from './send';

export interface AnkiPreviewArgs {
  cue: Cue;
  dict: DictName;
  dictEntry: DictEntry;
  /** Token range of the focus word inside `cue.tokens`, inclusive on both ends. */
  tokenSpan: [number, number];
}

export interface AnkiPreviewSheetProps {
  visible: boolean;
  args: AnkiPreviewArgs | null;
  entry: LibraryEntry;
  settings: AnkiSettings;
  onClose: () => void;
  onSent?: () => void;
}

type Phase =
  | { kind: 'building' }
  | { kind: 'ready'; assets: CardAssets; fields: Record<string, string> }
  | { kind: 'sending'; assets: CardAssets; fields: Record<string, string> }
  | { kind: 'error'; message: string };

export function AnkiPreviewSheet(props: AnkiPreviewSheetProps) {
  const { visible, args, entry, settings, onClose, onSent } = props;
  const [phase, setPhase] = useState<Phase>({ kind: 'building' });

  useEffect(() => {
    if (!visible || !args) return;
    let cancelled = false;
    setPhase({ kind: 'building' });
    (async () => {
      try {
        const assets = await buildCardAssets({
          entry,
          cue: args.cue,
          dict: args.dict,
          dictEntry: args.dictEntry,
          tokenSpan: args.tokenSpan,
          videoUri: entry.videoUri,
          settings,
        });
        if (cancelled) {
          cleanupCardAssets(assets);
          return;
        }
        setPhase({ kind: 'ready', assets, fields: { ...assets.fields } });
      } catch (e) {
        if (!cancelled) setPhase({ kind: 'error', message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, args, entry, settings]);

  const setField = (k: string, v: string) => {
    setPhase((p) => (p.kind === 'ready' ? { ...p, fields: { ...p.fields, [k]: v } } : p));
  };

  const onSend = async () => {
    if (phase.kind !== 'ready') return;
    const { assets, fields } = phase;
    setPhase({ kind: 'sending', assets, fields });
    try {
      // Bridge needs AnkiDroid + permission. If the user skipped the settings
      // "Connect" step, surface the prompt here as a fallback so we're not stuck.
      if (!AnkiClient.isAvailable()) {
        throw new Error('AnkiDroid is not installed.');
      }
      let granted = await AnkiClient.hasPermission();
      if (!granted) {
        granted = await AnkiClient.requestPermission();
      }
      if (!granted) {
        throw new Error('AnkiDroid permission denied. Open Settings → Anki → Connect AnkiDroid.');
      }

      await sendCardToAnki(assets, fields, settings);
      cleanupCardAssets(assets);
      onSent?.();
      onClose();
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  };

  const closeAndCleanup = () => {
    if (phase.kind === 'ready' || phase.kind === 'sending') {
      cleanupCardAssets(phase.assets);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeAndCleanup}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAndCleanup} />
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>Add to Anki</Text>
            <Pressable onPress={closeAndCleanup} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {phase.kind === 'building' && (
            <View style={styles.busy}>
              <ActivityIndicator color="#3b82f6" />
              <Text style={styles.busyText}>Extracting image + audio…</Text>
            </View>
          )}

          {phase.kind === 'error' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Failed</Text>
              <Text style={styles.errorBody}>{phase.message}</Text>
              <Pressable style={styles.primary} onPress={closeAndCleanup}>
                <Text style={styles.primaryText}>Close</Text>
              </Pressable>
            </View>
          )}

          {(phase.kind === 'ready' || phase.kind === 'sending') && (
            <KeyboardAvoidingView
              style={styles.body}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <Image source={{ uri: phase.assets.imageLocalUri }} style={styles.preview} />
                {phase.assets.media.length > 1 ? (
                  <Text style={styles.audioInfo}>Audio: {phase.assets.media[1].filename}</Text>
                ) : (
                  <Text style={styles.audioInfo}>Audio: not included</Text>
                )}

                <FieldEditor label="English" value={phase.fields.English} onChange={(v) => setField('English', v)} multiline />
                <FieldEditor label="Grammar note" value={phase.fields.GrammarNote} onChange={(v) => setField('GrammarNote', v)} multiline />
                <FieldEditor label="Focus word" value={phase.fields.FocusWord} onChange={(v) => setField('FocusWord', v)} />
                <FieldEditor label="Focus reading" value={phase.fields.FocusReading} onChange={(v) => setField('FocusReading', v)} />
                <FieldEditor label="Source" value={phase.fields.Source} onChange={(v) => setField('Source', v)} />
              </ScrollView>

              <Pressable
                style={[styles.primary, phase.kind === 'sending' && styles.disabled]}
                disabled={phase.kind === 'sending'}
                onPress={onSend}
              >
                <Text style={styles.primaryText}>
                  {phase.kind === 'sending' ? 'Sending…' : `Send to ${settings.defaultDeckName}`}
                </Text>
              </Pressable>
            </KeyboardAvoidingView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function FieldEditor({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    width: '100%',
    maxWidth: 520,
    flex: 1,
    maxHeight: '90%',
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  close: { color: '#888', fontSize: 18, padding: 4 },
  body: { flex: 1, gap: 12 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  busy: { alignItems: 'center', padding: 32, gap: 12 },
  busyText: { color: '#aaa' },
  preview: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 6,
  },
  audioInfo: { color: '#666', fontSize: 11, fontFamily: 'monospace' },
  field: { gap: 4 },
  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600' },
  fieldInput: {
    backgroundColor: '#181818',
    color: '#fff',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  fieldInputMulti: { minHeight: 64, textAlignVertical: 'top' },
  primary: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
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
});

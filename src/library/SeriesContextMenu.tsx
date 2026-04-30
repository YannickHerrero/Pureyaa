import { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TextInput, Alert } from 'react-native';
import type { LibraryEntry } from '@/types';
import { upsertEntry, deleteEntry } from '@/storage/entries';

export interface SeriesContextMenuProps {
  series: { name: string; entries: LibraryEntry[] } | null;
  onClose: () => void;
  onChanged: () => void;
}

type Pane = 'menu' | 'rename';

export function SeriesContextMenu({ series, onClose, onChanged }: SeriesContextMenuProps) {
  const [pane, setPane] = useState<Pane>('menu');
  const [draft, setDraft] = useState('');

  if (!series) return null;

  const close = () => {
    setPane('menu');
    onClose();
  };

  const onRename = () => {
    setDraft(series.name);
    setPane('rename');
  };

  const saveRename = async () => {
    const next = draft.trim();
    if (next.length === 0 || next === series.name) {
      close();
      return;
    }
    for (const e of series.entries) {
      await upsertEntry({ ...e, seriesName: next });
    }
    onChanged();
    close();
  };

  const onDeleteSeries = () => {
    Alert.alert(
      'Delete series',
      `What should happen to the ${series.entries.length} child entries?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to standalone',
          onPress: async () => {
            for (const e of series.entries) {
              await upsertEntry({ ...e, seriesName: null });
            }
            onChanged();
            close();
          },
        },
        {
          text: 'Delete child entries',
          style: 'destructive',
          onPress: async () => {
            for (const e of series.entries) {
              await deleteEntry(e.id);
            }
            onChanged();
            close();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={!!series} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {pane === 'menu' && (
            <>
              <Text style={styles.title} numberOfLines={1}>
                {series.name}
              </Text>
              <Pressable style={styles.menuItem} onPress={onRename}>
                <Text style={styles.menuText}>Rename series</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={onDeleteSeries}>
                <Text style={[styles.menuText, styles.destructive]}>Delete series</Text>
              </Pressable>
            </>
          )}
          {pane === 'rename' && (
            <View style={styles.pane}>
              <Text style={styles.title}>Rename series</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                style={styles.input}
                autoFocus
              />
              <View style={styles.row}>
                <Pressable style={styles.btn} onPress={() => setPane('menu')}>
                  <Text style={styles.btnText}>Back</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={saveRename}>
                  <Text style={styles.btnText}>Save</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f0f0f',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    gap: 4,
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  menuItem: { paddingVertical: 12 },
  menuText: { color: '#fff', fontSize: 15 },
  destructive: { color: '#f87171' },
  pane: { gap: 12 },
  input: {
    backgroundColor: '#181818',
    color: '#fff',
    padding: 12,
    borderRadius: 6,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    backgroundColor: '#374151',
    padding: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  btnPrimary: { backgroundColor: '#3b82f6' },
  btnText: { color: '#fff', fontWeight: '600' },
});

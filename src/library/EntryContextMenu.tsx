import { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TextInput, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FileAccess, withSession } from 'file-access';
import { File } from 'expo-file-system';
import type { LibraryEntry } from '@/types';
import { upsertEntry, deleteEntry } from '@/storage/entries';
import { extractThumbnail } from '@/utils/thumbnail';
import { thumbnailPathFor } from '@/storage/entries';

export interface EntryContextMenuProps {
  entry: LibraryEntry | null;
  knownSeries: string[];
  onClose: () => void;
  onChanged: () => void;
}

type Pane = 'menu' | 'editTitle' | 'series' | 'thumb';

export function EntryContextMenu({
  entry,
  knownSeries,
  onClose,
  onChanged,
}: EntryContextMenuProps) {
  const [pane, setPane] = useState<Pane>('menu');
  const [titleDraft, setTitleDraft] = useState('');
  const [seriesDraft, setSeriesDraft] = useState('');

  if (!entry) return null;

  const close = () => {
    setPane('menu');
    onClose();
  };

  const onEditTitle = () => {
    setTitleDraft(entry.title);
    setPane('editTitle');
  };
  const saveTitle = async () => {
    if (titleDraft.trim().length === 0) return;
    await upsertEntry({ ...entry, title: titleDraft.trim() });
    onChanged();
    close();
  };

  const onChangeSeries = () => {
    setSeriesDraft(entry.seriesName ?? '');
    setPane('series');
  };
  const saveSeries = async (name: string | null) => {
    await upsertEntry({ ...entry, seriesName: name && name.length > 0 ? name : null });
    onChanged();
    close();
  };

  const onChangeThumb = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (r.canceled) return;
    const dest = await thumbnailPathFor(entry.id);
    new File(r.assets[0].uri).copy(new File(dest));
    await upsertEntry({ ...entry, thumbnailPath: dest });
    onChanged();
    close();
  };

  const onRelocateVideo = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: false,
    });
    if (r.canceled) return;
    const handle = await FileAccess.persistFileAccess(r.assets[0].uri);
    await upsertEntry({ ...entry, videoUri: handle });
    onChanged();
    close();
  };

  const onReExtractThumb = async () => {
    try {
      const dest = await thumbnailPathFor(entry.id);
      const positionMs = Math.max(0, Math.floor(entry.durationSeconds * 1000 * 0.1));
      await withSession(entry.videoUri, (url) =>
        extractThumbnail(url, dest, positionMs),
      );
      await upsertEntry({ ...entry, thumbnailPath: dest });
      onChanged();
      close();
    } catch (e) {
      Alert.alert('Could not extract thumbnail', (e as Error).message);
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Delete entry?',
      `"${entry.title}" — analysis data and thumbnail will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Drop the persistent file-access handle before forgetting
            // the entry. Idempotent on Android, frees the iOS bookmark.
            try {
              await FileAccess.releaseFileAccess(entry.videoUri);
            } catch {
              // ignore — best-effort cleanup
            }
            await deleteEntry(entry.id);
            onChanged();
            close();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {pane === 'menu' && (
            <>
              <Text style={styles.title} numberOfLines={1}>{entry.title}</Text>
              <MenuItem label="Edit title" onPress={onEditTitle} />
              <MenuItem label="Re-locate video file" onPress={onRelocateVideo} />
              <MenuItem label="Change thumbnail (pick image)" onPress={onChangeThumb} />
              <MenuItem label="Re-extract thumbnail (10% mark)" onPress={onReExtractThumb} />
              <MenuItem
                label={entry.seriesName ? 'Change / remove series' : 'Move to series'}
                onPress={onChangeSeries}
              />
              <MenuItem label="Delete entry" destructive onPress={onDelete} />
            </>
          )}
          {pane === 'editTitle' && (
            <View style={styles.pane}>
              <Text style={styles.title}>Edit title</Text>
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                style={styles.input}
                autoFocus
              />
              <View style={styles.row}>
                <Pressable style={styles.btn} onPress={() => setPane('menu')}>
                  <Text style={styles.btnText}>Back</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={saveTitle}>
                  <Text style={styles.btnText}>Save</Text>
                </Pressable>
              </View>
            </View>
          )}
          {pane === 'series' && (
            <View style={styles.pane}>
              <Text style={styles.title}>Series</Text>
              <TextInput
                value={seriesDraft}
                onChangeText={setSeriesDraft}
                style={styles.input}
                placeholder="Series name (empty = standalone)"
                placeholderTextColor="#666"
              />
              {knownSeries.length > 0 && (
                <View style={styles.suggestions}>
                  {knownSeries.map((s) => (
                    <Pressable key={s} style={styles.chip} onPress={() => setSeriesDraft(s)}>
                      <Text style={styles.chipText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.row}>
                <Pressable style={styles.btn} onPress={() => setPane('menu')}>
                  <Text style={styles.btnText}>Back</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => saveSeries(seriesDraft.trim() || null)}>
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

function MenuItem({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Text style={[styles.menuItemText, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
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
  menuItemText: { color: '#fff', fontSize: 15 },
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
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chipText: { color: '#fff', fontSize: 12 },
});

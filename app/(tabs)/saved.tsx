import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { listSavedWords, removeSavedWord } from '@/storage/savedWords';
import { listEntries } from '@/storage/entries';
import type { LibraryEntry, SavedWord } from '@/types';

type Sort = 'recent' | 'reading';

export default function SavedWordsScreen() {
  const router = useRouter();
  const [words, setWords] = useState<SavedWord[]>([]);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [sort, setSort] = useState<Sort>('recent');

  const reload = useCallback(async () => {
    const [w, e] = await Promise.all([listSavedWords(), listEntries()]);
    setWords(w);
    setEntries(e);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const sorted = sortWords(words, sort);

  const onJump = (w: SavedWord) => {
    router.push({
      pathname: '/player/[id]',
      params: { id: w.sourceEntryId, cueIndex: String(w.sourceCueIndex) },
    });
  };

  const onDelete = (w: SavedWord) => {
    Alert.alert('Delete saved word?', w.surface, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeSavedWord(w.id);
          await reload();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <SortButton active={sort === 'recent'} onPress={() => setSort('recent')}>
          Recent
        </SortButton>
        <SortButton active={sort === 'reading'} onPress={() => setSort('reading')}>
          A→Z (reading)
        </SortButton>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>No saved words yet. Tap the ☆ in the popup while watching.</Text>
        ) : (
          sorted.map((w) => (
            <WordRow
              key={w.id}
              word={w}
              entry={entries.find((e) => e.id === w.sourceEntryId)}
              onJump={() => onJump(w)}
              onDelete={() => onDelete(w)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function sortWords(list: SavedWord[], by: Sort): SavedWord[] {
  const copy = list.slice();
  if (by === 'recent') {
    copy.sort((a, b) => b.dateSavedISO.localeCompare(a.dateSavedISO));
  } else {
    copy.sort((a, b) => a.reading.localeCompare(b.reading));
  }
  return copy;
}

function WordRow({
  word,
  entry,
  onJump,
  onDelete,
}: {
  word: SavedWord;
  entry: LibraryEntry | undefined;
  onJump: () => void;
  onDelete: () => void;
}) {
  const sourceLabel = entry
    ? `${entry.title}${entry.episodeNumber != null ? ` · Ep ${entry.episodeNumber}` : ''}`
    : 'source unavailable';
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.surface}>{word.surface}</Text>
        <Text style={styles.reading}>{word.reading}</Text>
      </View>
      <Text style={styles.def}>{word.shortDefinition}</Text>
      <HighlightedCue cueText={word.cueText} surface={word.surface} />
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{sourceLabel}</Text>
        <View style={styles.metaActions}>
          <Pressable onPress={onJump} style={[styles.smallBtn, styles.smallBtnPrimary]}>
            <Text style={styles.smallBtnText}>Jump</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.smallBtn}>
            <Text style={[styles.smallBtnText, styles.destructive]}>Delete</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.date}>{new Date(word.dateSavedISO).toLocaleDateString()}</Text>
    </View>
  );
}

function HighlightedCue({ cueText, surface }: { cueText: string; surface: string }) {
  if (!surface || !cueText) return <Text style={styles.cue}>{cueText}</Text>;
  const parts = cueText.split(surface);
  if (parts.length < 2) return <Text style={styles.cue}>{cueText}</Text>;
  return (
    <Text style={styles.cue}>
      {parts.map((part, i) => (
        <Text key={i}>
          {part}
          {i < parts.length - 1 ? <Text style={styles.cueHighlight}>{surface}</Text> : null}
        </Text>
      ))}
    </Text>
  );
}

function SortButton({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.sortBtn, active && styles.sortBtnActive]}>
      <Text style={styles.sortText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  toolbar: {
    flexDirection: 'row',
    gap: 6,
    padding: 12,
    borderBottomColor: '#1a1a1a',
    borderBottomWidth: 1,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#181818',
    borderRadius: 4,
  },
  sortBtnActive: { backgroundColor: '#3b82f6' },
  sortText: { color: '#fff', fontSize: 12 },
  list: { padding: 12, gap: 12 },
  empty: { color: '#666', textAlign: 'center', marginTop: 32 },
  row: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  surface: { color: '#fff', fontSize: 22, fontWeight: '600' },
  reading: { color: '#aaa', fontSize: 14 },
  def: { color: '#fff', fontSize: 14 },
  cue: { color: '#888', fontSize: 13, marginTop: 4 },
  cueHighlight: { color: '#fbbf24', fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  metaLabel: { color: '#666', fontSize: 12, flex: 1, marginRight: 8 },
  metaActions: { flexDirection: 'row', gap: 6 },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#222',
    borderRadius: 4,
  },
  smallBtnPrimary: { backgroundColor: '#3b82f6' },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  destructive: { color: '#f87171' },
  date: { color: '#444', fontSize: 11 },
});

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { listEntries } from '@/storage/entries';
import { groupBySeries, type GroupedItem, type SortKey } from '@/utils/grouping';
import { isWatched, type LibraryEntry } from '@/types';
import { formatHMS } from '@/utils/time';
import { EntryContextMenu } from '@/library/EntryContextMenu';
import { SeriesContextMenu } from '@/library/SeriesContextMenu';

const SORT_LABELS: Record<SortKey, string> = {
  dateAdded: 'Newest',
  recent: 'Recent',
  title: 'A–Z',
};

const SORTS: SortKey[] = ['dateAdded', 'recent', 'title'];

export default function LibraryScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [sort, setSort] = useState<SortKey>('dateAdded');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [entryMenu, setEntryMenu] = useState<LibraryEntry | null>(null);
  const [seriesMenu, setSeriesMenu] = useState<{ name: string; entries: LibraryEntry[] } | null>(null);

  const reload = useCallback(async () => {
    const e = await listEntries();
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

  const items = groupBySeries(entries, sort, query);
  const knownSeries = Array.from(
    new Set(entries.map((e) => e.seriesName).filter((s): s is string => !!s)),
  );

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search…"
          placeholderTextColor="#666"
          style={styles.search}
        />
        <View style={styles.sortRow}>
          {SORTS.map((s) => (
            <Pressable
              key={s}
              style={[styles.sortBtn, sort === s && styles.sortBtnActive]}
              onPress={() => setSort(s)}
            >
              <Text style={styles.sortText}>{SORT_LABELS[s]}</Text>
            </Pressable>
          ))}
          <View style={styles.spacer} />
          <Pressable style={styles.addBtn} onPress={() => router.push('/add')}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true);
          await reload();
          setRefreshing(false);
        }} tintColor="#fff" />}
      >
        {items.length === 0 ? (
          <Text style={styles.empty}>No entries yet. Tap + Add to get started.</Text>
        ) : (
          items.map((it) => (
            <ItemRow
              key={it.kind === 'series' ? `series:${it.name}` : `entry:${it.entry.id}`}
              item={it}
              expanded={it.kind === 'series' ? !!expanded[it.name] : false}
              onToggleExpand={
                it.kind === 'series'
                  ? () => setExpanded((p) => ({ ...p, [it.name]: !p[it.name] }))
                  : undefined
              }
              onOpenEntry={(e) => router.push({ pathname: '/player/[id]', params: { id: e.id } })}
              onLongPressEntry={(e) => setEntryMenu(e)}
              onLongPressSeries={(s) => setSeriesMenu(s)}
            />
          ))
        )}
      </ScrollView>

      <EntryContextMenu
        entry={entryMenu}
        knownSeries={knownSeries}
        onClose={() => setEntryMenu(null)}
        onChanged={reload}
      />
      <SeriesContextMenu
        series={seriesMenu}
        onClose={() => setSeriesMenu(null)}
        onChanged={reload}
      />
    </View>
  );
}

function ItemRow({
  item,
  expanded,
  onToggleExpand,
  onOpenEntry,
  onLongPressEntry,
  onLongPressSeries,
}: {
  item: GroupedItem;
  expanded: boolean;
  onToggleExpand?: () => void;
  onOpenEntry: (e: LibraryEntry) => void;
  onLongPressEntry: (e: LibraryEntry) => void;
  onLongPressSeries: (s: { name: string; entries: LibraryEntry[] }) => void;
}) {
  if (item.kind === 'standalone') {
    return (
      <EntryTile
        entry={item.entry}
        onPress={() => onOpenEntry(item.entry)}
        onLongPress={() => onLongPressEntry(item.entry)}
      />
    );
  }
  return (
    <View style={styles.series}>
      <Pressable
        style={styles.seriesHead}
        onPress={onToggleExpand}
        onLongPress={() => onLongPressSeries({ name: item.name, entries: item.entries })}
      >
        <Text style={styles.seriesArrow}>{expanded ? '▾' : '▸'}</Text>
        <Text style={styles.seriesName}>{item.name}</Text>
        <Text style={styles.seriesCount}>{item.entries.length}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.seriesBody}>
          {item.entries.map((e) => (
            <EntryTile
              key={e.id}
              entry={e}
              onPress={() => onOpenEntry(e)}
              onLongPress={() => onLongPressEntry(e)}
              indented
            />
          ))}
        </View>
      )}
    </View>
  );
}

function EntryTile({
  entry,
  onPress,
  onLongPress,
  indented,
}: {
  entry: LibraryEntry;
  onPress: () => void;
  onLongPress?: () => void;
  indented?: boolean;
}) {
  return (
    <Pressable
      style={[styles.tile, indented && styles.tileIndented]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {entry.thumbnailPath ? (
        <Image source={{ uri: entry.thumbnailPath }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text style={styles.thumbPlaceholderText}>—</Text>
        </View>
      )}
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {entry.episodeNumber != null ? `Ep ${entry.episodeNumber} · ` : ''}
          {entry.title}
        </Text>
        <Text style={styles.tileMeta}>
          {formatHMS(entry.durationSeconds)} · {Math.round(entry.watchProgressPercent)}%
          {isWatched(entry) ? ' · watched' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  toolbar: { padding: 12, gap: 8, borderBottomColor: '#1a1a1a', borderBottomWidth: 1 },
  search: {
    backgroundColor: '#181818',
    color: '#fff',
    borderRadius: 6,
    padding: 10,
  },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#181818',
    borderRadius: 4,
  },
  sortBtnActive: { backgroundColor: '#3b82f6' },
  sortText: { color: '#fff', fontSize: 12 },
  spacer: { flex: 1 },
  addBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, gap: 12 },
  empty: { color: '#666', textAlign: 'center', marginTop: 32 },
  series: { backgroundColor: '#0d0d0d', borderRadius: 8 },
  seriesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  seriesArrow: { color: '#888', width: 16 },
  seriesName: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
  seriesCount: { color: '#888', fontSize: 13 },
  seriesBody: { padding: 6, gap: 6, paddingTop: 0 },
  tile: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tileIndented: { marginLeft: 12 },
  thumb: { width: 96, height: 54, backgroundColor: '#222' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { color: '#666' },
  tileBody: { flex: 1, padding: 10, justifyContent: 'center' },
  tileTitle: { color: '#fff', fontSize: 15 },
  tileMeta: { color: '#888', fontSize: 12, marginTop: 4 },
});

import type { LibraryEntry } from '@/types';

export type SortKey = 'dateAdded' | 'recent' | 'title';

export type GroupedItem =
  | { kind: 'series'; name: string; entries: LibraryEntry[] }
  | { kind: 'standalone'; entry: LibraryEntry };

export function sortEntries(entries: LibraryEntry[], by: SortKey): LibraryEntry[] {
  const copy = entries.slice();
  switch (by) {
    case 'dateAdded':
      copy.sort((a, b) => b.dateAddedISO.localeCompare(a.dateAddedISO));
      break;
    case 'recent':
      copy.sort((a, b) =>
        (b.lastWatchedISO ?? '').localeCompare(a.lastWatchedISO ?? ''),
      );
      break;
    case 'title':
      copy.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }
  return copy;
}

export function groupBySeries(
  entries: LibraryEntry[],
  sortKey: SortKey,
  query: string,
): GroupedItem[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.seriesName?.toLowerCase().includes(q) ?? false),
      )
    : entries;

  const seriesMap = new Map<string, LibraryEntry[]>();
  const standalone: LibraryEntry[] = [];

  for (const e of filtered) {
    if (e.seriesName) {
      const list = seriesMap.get(e.seriesName) ?? [];
      list.push(e);
      seriesMap.set(e.seriesName, list);
    } else {
      standalone.push(e);
    }
  }

  for (const list of seriesMap.values()) {
    list.sort((a, b) => {
      const aN = a.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      const bN = b.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      if (aN !== bN) return aN - bN;
      return a.title.localeCompare(b.title);
    });
  }

  // Outer ordering follows the chosen sort, using the latest entry of each
  // group as the representative timestamp.
  const seriesItems: GroupedItem[] = Array.from(seriesMap.entries()).map(
    ([name, list]) => ({ kind: 'series', name, entries: list }),
  );
  const standaloneItems: GroupedItem[] = standalone.map((e) => ({
    kind: 'standalone',
    entry: e,
  }));

  const allItems: GroupedItem[] = [...seriesItems, ...standaloneItems];
  allItems.sort((a, b) => compareGrouped(a, b, sortKey));
  return allItems;
}

function representative(item: GroupedItem): LibraryEntry {
  if (item.kind === 'standalone') return item.entry;
  // Pick the most-recent / first / etc by simply scanning
  let best = item.entries[0];
  for (const e of item.entries) {
    if (e.dateAddedISO > best.dateAddedISO) best = e;
  }
  return best;
}

function compareGrouped(a: GroupedItem, b: GroupedItem, key: SortKey): number {
  const ea = representative(a);
  const eb = representative(b);
  switch (key) {
    case 'dateAdded':
      return eb.dateAddedISO.localeCompare(ea.dateAddedISO);
    case 'recent':
      return (eb.lastWatchedISO ?? '').localeCompare(ea.lastWatchedISO ?? '');
    case 'title': {
      const ta = a.kind === 'series' ? a.name : a.entry.title;
      const tb = b.kind === 'series' ? b.name : b.entry.title;
      return ta.localeCompare(tb);
    }
  }
}

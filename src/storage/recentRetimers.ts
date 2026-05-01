import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './keys';

const MAX_RECENTS = 8;

export interface RecentRetimer {
  offsetMs: number;
  scaleFactor: number;
  lastUsedISO: string;
}

export async function getRecentRetimers(): Promise<RecentRetimer[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.recentRetimers);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as RecentRetimer[]) : [];
  } catch {
    return [];
  }
}

export async function addRecentRetimer(
  offsetMs: number,
  scaleFactor: number,
): Promise<void> {
  if (offsetMs === 0 && scaleFactor === 1) return; // ignore the no-op state
  const list = await getRecentRetimers();
  const filtered = list.filter(
    (r) => !(r.offsetMs === offsetMs && r.scaleFactor === scaleFactor),
  );
  filtered.unshift({
    offsetMs,
    scaleFactor,
    lastUsedISO: new Date().toISOString(),
  });
  await AsyncStorage.setItem(
    STORAGE_KEYS.recentRetimers,
    JSON.stringify(filtered.slice(0, MAX_RECENTS)),
  );
}

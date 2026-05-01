/**
 * AsyncStorage-backed cache for the bulk-fetched WaniKani kanji map.
 *
 * Once seeded (typically when the user enters their API key), every card
 * build can read the WK info offline. The whole map (~2k kanji, ~150 KB
 * compact JSON) lives in a single AsyncStorage entry — small enough that
 * a single read on first access covers every later lookup in the session.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/storage/keys';
import type { KanjiInfo } from './api';

interface KanjiCache {
  fetchedAt: string;
  byChar: Record<string, KanjiInfo>;
}

let memoryCache: KanjiCache | null = null;

async function loadCache(): Promise<KanjiCache | null> {
  if (memoryCache) return memoryCache;
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.wanikaniKanjiCache);
  if (!raw) return null;
  try {
    memoryCache = JSON.parse(raw) as KanjiCache;
    return memoryCache;
  } catch {
    return null;
  }
}

export async function saveKanjiCache(byChar: Record<string, KanjiInfo>): Promise<void> {
  const cache: KanjiCache = { fetchedAt: new Date().toISOString(), byChar };
  memoryCache = cache;
  await AsyncStorage.setItem(STORAGE_KEYS.wanikaniKanjiCache, JSON.stringify(cache));
}

export async function clearKanjiCache(): Promise<void> {
  memoryCache = null;
  await AsyncStorage.removeItem(STORAGE_KEYS.wanikaniKanjiCache);
}

export async function getKanjiInfo(char: string): Promise<KanjiInfo | null> {
  const cache = await loadCache();
  return cache?.byChar[char] ?? null;
}

export interface KanjiCacheStats {
  count: number;
  fetchedAt: string;
}

export async function getKanjiCacheStats(): Promise<KanjiCacheStats | null> {
  const cache = await loadCache();
  if (!cache) return null;
  return { count: Object.keys(cache.byChar).length, fetchedAt: cache.fetchedAt };
}

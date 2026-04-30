import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { AnalysisData, LibraryEntry } from '@/types';
import { STORAGE_KEYS } from './keys';

const ANALYSIS_DIR = `${FileSystem.documentDirectory ?? ''}analysis/`;
const THUMB_DIR = `${FileSystem.documentDirectory ?? ''}thumbnails/`;

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

export async function listEntries(): Promise<LibraryEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.entries);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LibraryEntry[];
  } catch {
    return [];
  }
}

export async function saveEntries(entries: LibraryEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
}

export async function upsertEntry(entry: LibraryEntry): Promise<void> {
  const all = await listEntries();
  const idx = all.findIndex((e) => e.id === entry.id);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  await saveEntries(all);
}

export async function getEntry(id: string): Promise<LibraryEntry | null> {
  const all = await listEntries();
  return all.find((e) => e.id === id) ?? null;
}

export async function deleteEntry(id: string): Promise<void> {
  const all = await listEntries();
  const entry = all.find((e) => e.id === id);
  await saveEntries(all.filter((e) => e.id !== id));
  if (entry) {
    await safeDelete(entry.analysisDataPath);
    await safeDelete(entry.thumbnailPath);
  }
}

async function safeDelete(path: string): Promise<void> {
  if (!path) return;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore — best effort
  }
}

export async function analysisPathFor(entryId: string): Promise<string> {
  await ensureDir(ANALYSIS_DIR);
  return `${ANALYSIS_DIR}${entryId}.json`;
}

export async function thumbnailPathFor(entryId: string): Promise<string> {
  await ensureDir(THUMB_DIR);
  return `${THUMB_DIR}${entryId}.jpg`;
}

export async function readAnalysisData(path: string): Promise<AnalysisData | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as AnalysisData;
  } catch {
    return null;
  }
}

export async function writeAnalysisData(path: string, data: AnalysisData): Promise<void> {
  await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { AnalysisData, LibraryEntry } from '@/types';
import { STORAGE_KEYS } from './keys';

const ANALYSIS_DIR = new Directory(Paths.document, 'analysis');
const THUMB_DIR = new Directory(Paths.document, 'thumbnails');

function ensureDir(dir: Directory): void {
  if (!dir.exists) dir.create({ intermediates: true });
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
    safeDelete(entry.analysisDataPath);
    safeDelete(entry.thumbnailPath);
  }
}

function safeDelete(path: string): void {
  if (!path) return;
  try {
    const file = new File(path);
    if (file.exists) file.delete();
  } catch {
    // ignore — best effort
  }
}

export async function analysisPathFor(entryId: string): Promise<string> {
  ensureDir(ANALYSIS_DIR);
  return new File(ANALYSIS_DIR, `${entryId}.json`).uri;
}

export async function thumbnailPathFor(entryId: string): Promise<string> {
  ensureDir(THUMB_DIR);
  return new File(THUMB_DIR, `${entryId}.jpg`).uri;
}

export async function readAnalysisData(path: string): Promise<AnalysisData | null> {
  try {
    const file = new File(path);
    if (!file.exists) return null;
    const raw = await file.text();
    return JSON.parse(raw) as AnalysisData;
  } catch {
    return null;
  }
}

export async function writeAnalysisData(path: string, data: AnalysisData): Promise<void> {
  new File(path).write(JSON.stringify(data));
}

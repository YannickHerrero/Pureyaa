import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedWord } from '@/types';
import { STORAGE_KEYS } from './keys';

export async function listSavedWords(): Promise<SavedWord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.savedWords);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedWord[];
  } catch {
    return [];
  }
}

export async function saveSavedWords(words: SavedWord[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.savedWords, JSON.stringify(words));
}

export async function addSavedWord(word: SavedWord): Promise<void> {
  const all = await listSavedWords();
  const dup = all.find(
    (w) =>
      w.surface === word.surface &&
      w.sourceEntryId === word.sourceEntryId &&
      w.sourceCueIndex === word.sourceCueIndex,
  );
  if (dup) return;
  all.unshift(word);
  await saveSavedWords(all);
}

export async function removeSavedWord(id: string): Promise<void> {
  const all = await listSavedWords();
  await saveSavedWords(all.filter((w) => w.id !== id));
}

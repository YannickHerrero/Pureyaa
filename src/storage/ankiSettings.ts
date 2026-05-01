import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnkiSettings } from '@/types';
import { DEFAULT_ANKI_SETTINGS } from '@/types';
import { STORAGE_KEYS } from './keys';

export async function getAnkiSettings(): Promise<AnkiSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.ankiSettings);
  if (!raw) return DEFAULT_ANKI_SETTINGS;
  try {
    return {
      ...DEFAULT_ANKI_SETTINGS,
      ...(JSON.parse(raw) as Partial<AnkiSettings>),
    };
  } catch {
    return DEFAULT_ANKI_SETTINGS;
  }
}

export async function saveAnkiSettings(settings: AnkiSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.ankiSettings, JSON.stringify(settings));
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AppSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { SECURE_KEYS, STORAGE_KEYS } from './keys';

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.anthropicApiKey);
  } catch {
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.anthropicApiKey, key);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.anthropicApiKey);
}

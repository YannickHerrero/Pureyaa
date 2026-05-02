import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AppSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { LEGACY_SECURE_KEYS, SECURE_KEYS, STORAGE_KEYS } from './keys';

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

export async function getOpenRouterApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.openrouterApiKey);
  } catch {
    return null;
  }
}

export async function setOpenRouterApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.openrouterApiKey, key);
  // Belt-and-suspenders: every save also clears any leftover keys from
  // the previous multi-provider setup. Cheap, idempotent, no-op when
  // already gone.
  for (const legacy of LEGACY_SECURE_KEYS) {
    try {
      await SecureStore.deleteItemAsync(legacy);
    } catch {
      // Slot doesn't exist — fine.
    }
  }
}

export async function clearOpenRouterApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.openrouterApiKey);
}

export async function getWanikaniApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.wanikaniApiKey);
  } catch {
    return null;
  }
}

export async function setWanikaniApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.wanikaniApiKey, key);
}

export async function clearWanikaniApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.wanikaniApiKey);
}

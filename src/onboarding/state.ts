import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { STORAGE_KEYS } from '@/storage/keys';

export const DICT_DIR = new Directory(Paths.document, 'dict');
export const JMDICT_FILE = new File(DICT_DIR, 'jmdict.dict');
export const JMNEDICT_FILE = new File(DICT_DIR, 'jmnedict.dict');

export function dictsAvailable(): boolean {
  return JMDICT_FILE.exists && JMNEDICT_FILE.exists;
}

export async function isOnboarded(): Promise<boolean> {
  const flag = await AsyncStorage.getItem(STORAGE_KEYS.onboarded);
  return flag === '1' && dictsAvailable();
}

export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.onboarded, '1');
}

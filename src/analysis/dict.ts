import type { File } from 'expo-file-system';
import { JMDICT_FILE, JMNEDICT_FILE } from '@/onboarding/state';
import type { DictName } from '@/types';

export interface DictSenseExample {
  jpn?: string;
  eng?: string;
}

export interface DictSense {
  pos: string[];
  glosses: string[];
  fields?: string[];
  misc?: string[];
  examples?: DictSenseExample[];
}

export interface DictEntry {
  id: number;
  forms: string[];
  readings: string[];
  senses: DictSense[];
  frequency?: string;
  nameType?: string[];
}

export interface DictBundle {
  index: Record<string, number[]>;
  entries: Record<string, DictEntry>;
}

let jmdict: DictBundle | null = null;
let jmnedict: DictBundle | null = null;

const EMPTY: DictBundle = { index: {}, entries: {} };

async function loadFromFile(file: File): Promise<DictBundle> {
  try {
    if (!file.exists) return EMPTY;
    const text = await file.text();
    return JSON.parse(text) as DictBundle;
  } catch {
    return EMPTY;
  }
}

export async function loadDictionaries(): Promise<void> {
  if (!jmdict) jmdict = await loadFromFile(JMDICT_FILE);
  if (!jmnedict) jmnedict = await loadFromFile(JMNEDICT_FILE);
}

export function lookup(form: string, dict: DictName): number[] {
  const bundle = dict === 'jmdict' ? jmdict : jmnedict;
  if (!bundle) return [];
  const hits = bundle.index[form];
  return hits ?? [];
}

export function getEntries(ids: number[], dict: DictName): DictEntry[] {
  const bundle = dict === 'jmdict' ? jmdict : jmnedict;
  if (!bundle) return [];
  const out: DictEntry[] = [];
  for (const id of ids) {
    const e = bundle.entries[String(id)];
    if (e) out.push(e);
  }
  return out;
}

export function isLoaded(): boolean {
  return jmdict !== null && jmnedict !== null;
}

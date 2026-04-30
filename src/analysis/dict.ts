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
  // Maps avoid Hermes' 196,607-property-per-object limit. JMnedict alone
  // has ~750k entries, which exceeds it by 4×.
  index: Map<string, number[]>;
  entries: Map<number, DictEntry>;
}

export interface SerializedDictBundle {
  index: [string, number[]][];
  entries: [number, DictEntry][];
}

let jmdict: DictBundle | null = null;
let jmnedict: DictBundle | null = null;

const EMPTY: DictBundle = { index: new Map(), entries: new Map() };

async function loadFromFile(file: File): Promise<DictBundle> {
  try {
    if (!file.exists) return EMPTY;
    const text = await file.text();
    const parsed = JSON.parse(text) as SerializedDictBundle;
    return {
      index: new Map(parsed.index),
      entries: new Map(parsed.entries),
    };
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
  return bundle.index.get(form) ?? [];
}

export function getEntries(ids: number[], dict: DictName): DictEntry[] {
  const bundle = dict === 'jmdict' ? jmdict : jmnedict;
  if (!bundle) return [];
  const out: DictEntry[] = [];
  for (const id of ids) {
    const e = bundle.entries.get(id);
    if (e) out.push(e);
  }
  return out;
}

export function isLoaded(): boolean {
  return jmdict !== null && jmnedict !== null;
}

export function serializeBundle(bundle: DictBundle): SerializedDictBundle {
  return {
    index: Array.from(bundle.index.entries()),
    entries: Array.from(bundle.entries.entries()),
  };
}

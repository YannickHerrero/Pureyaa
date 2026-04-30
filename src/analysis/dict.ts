import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import jmdictAsset from '../../assets/dict/jmdict.dict';
import jmnedictAsset from '../../assets/dict/jmnedict.dict';
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

export async function loadDictionaries(): Promise<void> {
  if (!jmdict) jmdict = await loadFromAsset(jmdictAsset);
  if (!jmnedict) jmnedict = await loadFromAsset(jmnedictAsset);
}

async function loadFromAsset(moduleId: number): Promise<DictBundle> {
  try {
    const [asset] = await Asset.loadAsync(moduleId);
    const uri = asset.localUri ?? asset.uri;
    const text = await new File(uri).text();
    return JSON.parse(text) as DictBundle;
  } catch {
    return EMPTY;
  }
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

import type { DictName } from '@/types';

/**
 * Bundled-dictionary loader. The real JMDict / JMnedict are too large to
 * commit to the repo; the loader expects two index objects keyed by surface
 * form (or kana reading) → list of entry ids. The full entry payloads live
 * in a parallel object keyed by entry id.
 *
 * Drop the converted JSON at assets/dict/jmdict.json + jmnedict.json (see
 * README) and this module will pick them up.
 */
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
  forms: string[]; // kanji + kana headwords
  readings: string[];
  senses: DictSense[];
  frequency?: string;
  // For JMnedict only:
  nameType?: string[]; // person, place, organization, ...
}

export interface DictBundle {
  // Lookup index: form (or reading) → entry ids
  index: Record<string, number[]>;
  // Entry id → full entry payload
  entries: Record<string, DictEntry>;
}

let jmdict: DictBundle | null = null;
let jmnedict: DictBundle | null = null;

const EMPTY: DictBundle = { index: {}, entries: {} };

export async function loadDictionaries(): Promise<void> {
  if (!jmdict) jmdict = await tryLoad('jmdict');
  if (!jmnedict) jmnedict = await tryLoad('jmnedict');
}

async function tryLoad(name: DictName): Promise<DictBundle> {
  try {
    if (name === 'jmdict') {
      const mod = await import('../../assets/dict/jmdict.json');
      return (mod as any).default ?? (mod as unknown as DictBundle);
    }
    const mod = await import('../../assets/dict/jmnedict.json');
    return (mod as any).default ?? (mod as unknown as DictBundle);
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

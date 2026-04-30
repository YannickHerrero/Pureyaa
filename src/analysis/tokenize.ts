import { Asset } from 'expo-asset';
import pako from 'pako';
import type { Token } from '@/types';

// kuromoji's RN loader requires zlibjs/bin/gunzip.min.js, which is a
// browser-style script that doesn't expose its Zlib namespace under Hermes.
// Patch the prototype so the loader uses pako instead. Same input/output —
// fetch the gzipped dict, decompress, hand back an ArrayBuffer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RNDictionaryLoader = require('kuromoji-react-native/src/loader/ReactNativeDictionaryLoader');
RNDictionaryLoader.prototype.loadArrayBuffer = function (
  url: string,
  callback: (err: Error | null, buffer: ArrayBuffer | null) => void,
) {
  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} loading ${url}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const inflated = pako.ungzip(new Uint8Array(buf));
      callback(null, inflated.buffer as ArrayBuffer);
    })
    .catch((err) => callback(err, null));
};

// kuromoji's TokenInfoDictionary builds target_map as a plain object with
// ~250k integer keys. Hermes caps single objects at 196,607 properties, so
// this either crashes or stalls during dictionary load. Replace with a Map
// wrapped in a Proxy so existing target_map[trie_id] reads in ViterbiBuilder
// continue to work without modification.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TokenInfoDictionary = require('kuromoji-react-native/src/dict/TokenInfoDictionary');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ByteBuffer = require('kuromoji-react-native/src/util/ByteBuffer');

function mapAsTargetMap(map: Map<number, number[]>): Map<number, number[]> {
  return new Proxy(map, {
    get(target, prop) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const own = (target as any)[prop];
      if (typeof own === 'function') return own.bind(target);
      if (own !== undefined) return own;
      if (typeof prop === 'string') {
        const n = Number(prop);
        if (Number.isFinite(n)) return target.get(n);
      }
      return undefined;
    },
    set(target, prop, value) {
      if (typeof prop === 'string') {
        const n = Number(prop);
        if (Number.isFinite(n)) {
          target.set(n, value);
          return true;
        }
      }
      return false;
    },
  }) as unknown as Map<number, number[]>;
}

TokenInfoDictionary.prototype.loadTargetMap = function (array_buffer: ArrayBuffer) {
  const buffer = new ByteBuffer(array_buffer);
  buffer.position = 0;
  const map = new Map<number, number[]>();
  buffer.readInt(); // map_keys_size — informational, ignored
  while (true) {
    if (buffer.buffer.length < buffer.position + 1) break;
    const key = buffer.readInt();
    const valuesSize = buffer.readInt();
    const values: number[] = new Array(valuesSize);
    for (let i = 0; i < valuesSize; i++) {
      values[i] = buffer.readInt();
    }
    map.set(key, values);
  }
  this.target_map = mapAsTargetMap(map);
  return this;
};

interface KuromojiToken {
  surface_form: string;
  reading?: string;
  basic_form?: string;
  pos?: string;
  pos_detail_1?: string;
  word_position?: number;
}

interface KuromojiTokenizer {
  tokenize(text: string): KuromojiToken[];
}

const DICT_MODULES: Record<string, number> = {
  'base.dat.gz': require('kuromoji-react-native/dict/base.dat.gz'),
  'check.dat.gz': require('kuromoji-react-native/dict/check.dat.gz'),
  'tid.dat.gz': require('kuromoji-react-native/dict/tid.dat.gz'),
  'tid_pos.dat.gz': require('kuromoji-react-native/dict/tid_pos.dat.gz'),
  'tid_map.dat.gz': require('kuromoji-react-native/dict/tid_map.dat.gz'),
  'cc.dat.gz': require('kuromoji-react-native/dict/cc.dat.gz'),
  'unk.dat.gz': require('kuromoji-react-native/dict/unk.dat.gz'),
  'unk_pos.dat.gz': require('kuromoji-react-native/dict/unk_pos.dat.gz'),
  'unk_map.dat.gz': require('kuromoji-react-native/dict/unk_map.dat.gz'),
  'unk_char.dat.gz': require('kuromoji-react-native/dict/unk_char.dat.gz'),
  'unk_compat.dat.gz': require('kuromoji-react-native/dict/unk_compat.dat.gz'),
  'unk_invoke.dat.gz': require('kuromoji-react-native/dict/unk_invoke.dat.gz'),
};

let tokenizerPromise: Promise<KuromojiTokenizer> | null = null;

async function buildTokenizer(): Promise<KuromojiTokenizer> {
  const filenames = Object.keys(DICT_MODULES);
  const assets = await Asset.loadAsync(filenames.map((f) => DICT_MODULES[f]));
  const dicPath: Record<string, string> = {};
  filenames.forEach((f, i) => {
    dicPath[f] = assets[i].localUri ?? assets[i].uri;
  });

  const km = await import('kuromoji-react-native');
  const builder = (km as any).default ?? km;
  return await new Promise<KuromojiTokenizer>((resolve, reject) => {
    builder.builder({ dicPath }).build((err: Error | null, tokenizer: KuromojiTokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
}

export async function getTokenizer(): Promise<KuromojiTokenizer> {
  if (!tokenizerPromise) tokenizerPromise = buildTokenizer();
  return tokenizerPromise;
}

export function resetTokenizer(): void {
  tokenizerPromise = null;
}

function toKatakana(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x3041 && code <= 0x3096) {
      out += String.fromCharCode(code + 0x60);
    } else {
      out += s[i];
    }
  }
  return out;
}

export async function tokenize(text: string): Promise<Token[]> {
  const tokenizer = await getTokenizer();
  const raw = tokenizer.tokenize(text);
  let cursor = 0;
  const tokens: Token[] = [];
  for (const t of raw) {
    const surface = t.surface_form ?? '';
    const idx = text.indexOf(surface, cursor);
    const charStart = idx >= 0 ? idx : cursor;
    const charEnd = charStart + surface.length;
    cursor = charEnd;
    tokens.push({
      surface,
      reading: toKatakana(t.reading ?? surface),
      lemma: t.basic_form && t.basic_form !== '*' ? t.basic_form : surface,
      pos: t.pos ?? '',
      charStart,
      charEnd,
    });
  }
  return tokens;
}

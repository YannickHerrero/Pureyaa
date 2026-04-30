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

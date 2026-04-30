import type { Token } from '@/types';

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

let tokenizerPromise: Promise<KuromojiTokenizer> | null = null;

async function buildTokenizer(): Promise<KuromojiTokenizer> {
  // kuromoji-react-native exposes a builder that loads dictionary files
  // bundled with the package. We import lazily so the module only loads
  // when the analysis pipeline runs.
  const km = await import('kuromoji-react-native');
  const builder = (km as any).default ?? km;
  return await new Promise<KuromojiTokenizer>((resolve, reject) => {
    builder.builder().build((err: Error | null, tokenizer: KuromojiTokenizer) => {
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
  // Kuromoji emits readings in katakana already. Defensive: convert any
  // hiragana that slipped through.
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

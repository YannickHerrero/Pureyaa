import type { Token } from '@/types';

const KANJI_RANGE = /[一-鿿㐀-䶿]/;

function katakanaToHiragana(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCharCode(code - 0x60);
    } else {
      out += s[i];
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wrap each kanji-bearing token in <ruby>surface<rt>reading</rt></ruby>;
 * leave kana-only tokens as plain (escaped) text. The reading is converted
 * from kuromoji's katakana to hiragana for the standard mining-card look.
 */
export function buildRubyHtml(tokens: Token[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    const surface = t.surface;
    if (!surface) continue;
    const hasKanji = KANJI_RANGE.test(surface);
    const reading = t.reading ? katakanaToHiragana(t.reading) : '';
    if (hasKanji && reading && reading !== surface) {
      parts.push(`<ruby>${escapeHtml(surface)}<rt>${escapeHtml(reading)}</rt></ruby>`);
    } else {
      parts.push(escapeHtml(surface));
    }
  }
  return parts.join('');
}

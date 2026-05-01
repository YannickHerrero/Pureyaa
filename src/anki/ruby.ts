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
 *
 * If `focusSpan` is given, the inclusive token range it points to is wrapped
 * in a single `<span class="focus">…</span>` so the card can underline the
 * focus word as one continuous mark across multiple tokens.
 */
export function buildRubyHtml(tokens: Token[], focusSpan?: [number, number]): string {
  const parts: string[] = [];
  const [fs, fe] = focusSpan ?? [-1, -1];
  for (let i = 0; i < tokens.length; i++) {
    if (i === fs) parts.push('<span class="focus">');
    const t = tokens[i];
    const surface = t.surface;
    if (surface) {
      const hasKanji = KANJI_RANGE.test(surface);
      const reading = t.reading ? katakanaToHiragana(t.reading) : '';
      if (hasKanji && reading && reading !== surface) {
        parts.push(`<ruby>${escapeHtml(surface)}<rt>${escapeHtml(reading)}</rt></ruby>`);
      } else {
        parts.push(escapeHtml(surface));
      }
    }
    if (i === fe) parts.push('</span>');
  }
  return parts.join('');
}

/**
 * Plain-text version of the sentence (no furigana), with the focus tokens
 * wrapped in `<span class="focus">…</span>` for underlining on the card.
 */
export function buildPlainSentenceHtml(
  tokens: Token[],
  focusSpan: [number, number],
): string {
  const parts: string[] = [];
  const [fs, fe] = focusSpan;
  for (let i = 0; i < tokens.length; i++) {
    if (i === fs) parts.push('<span class="focus">');
    const surface = tokens[i].surface;
    if (surface) parts.push(escapeHtml(surface));
    if (i === fe) parts.push('</span>');
  }
  return parts.join('');
}

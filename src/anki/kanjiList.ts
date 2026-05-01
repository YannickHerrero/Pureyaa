/**
 * Renders the kanji-list HTML field for a card using the cached WaniKani
 * data. Non-WK kanji are silently skipped (per user preference); the
 * result is an empty string when no kanji in the sentence map to WK.
 */

import { getKanjiInfo } from '@/wanikani/cache';

const KANJI_RANGE = /[一-鿿㐀-䶿]/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hiraganaToKatakana(s: string): string {
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

function uniqueKanji(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of text) {
    if (KANJI_RANGE.test(ch) && !seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}

/**
 * Build the compact-rows kanji list HTML. Each row:
 *   <kanji>  <meaning, meaning>  ·  <ON / kun>
 *
 * On'yomi readings are converted hiragana→katakana for the conventional
 * Japanese-dictionary look (WK stores both kinds in hiragana internally).
 */
export async function buildKanjiListHtml(sentence: string): Promise<string> {
  const chars = uniqueKanji(sentence);
  const rows: string[] = [];
  for (const ch of chars) {
    const info = await getKanjiInfo(ch);
    if (!info) continue;
    const meanings = info.meanings.slice(0, 3).map(escapeHtml).join(', ');
    const on = info.onyomi.map((r) => escapeHtml(hiraganaToKatakana(r))).join(' ');
    const kun = info.kunyomi.map(escapeHtml).join(' ');
    const readings = [on, kun].filter(Boolean).join(' / ');
    rows.push(
      `<div class="kanji-row">` +
        `<span class="kanji-char">${escapeHtml(info.character)}</span>` +
        `<span class="kanji-meanings">${meanings}</span>` +
        (readings ? `<span class="kanji-readings">${readings}</span>` : '') +
        `</div>`,
    );
  }
  if (rows.length === 0) return '';
  return `<div class="kanji-list">${rows.join('')}</div>`;
}

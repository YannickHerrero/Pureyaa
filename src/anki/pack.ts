/**
 * AnkiconnectAndroid does not implement `createModel`, so we can't install a
 * custom note type. Pack our 10 conceptual fields into AnkiDroid's built-in
 * "Basic" note type's Front + Back HTML instead.
 */
export function packIntoBasicFields(fields: Record<string, string>): {
  Front: string;
  Back: string;
} {
  const image = fields.Image ?? '';
  const audio = fields.Audio ?? '';
  const jpRuby = fields.JapaneseRuby ?? '';
  const english = fields.English ?? '';
  const grammar = fields.GrammarNote ?? '';
  const focusWord = fields.FocusWord ?? '';
  const focusReading = fields.FocusReading ?? '';
  const focusGlosses = fields.FocusGlosses ?? '';
  const source = fields.Source ?? '';

  const front = [
    image,
    `<div style="font-size:24px;line-height:1.6;text-align:center;margin-top:8px">${jpRuby}</div>`,
    audio,
  ]
    .filter((p) => p)
    .join('\n');

  const backParts: string[] = [];
  if (english) {
    backParts.push(
      `<div style="text-align:center;margin-bottom:8px">${escapeText(english)}</div>`,
    );
  }
  if (grammar) {
    backParts.push(
      `<div style="color:#b45309;font-style:italic;font-size:14px;margin-bottom:8px">${escapeText(grammar)}</div>`,
    );
  }
  if (focusWord) {
    const reading = focusReading ? ` <span style="color:#6b7280">(${escapeText(focusReading)})</span>` : '';
    backParts.push(
      `<div style="margin-top:12px;padding:8px;background:#f9fafb;border-radius:6px">` +
        `<div><b>${escapeText(focusWord)}</b>${reading}</div>` +
        focusGlosses +
        `</div>`,
    );
  }
  if (source) {
    backParts.push(
      `<div style="color:#9ca3af;font-size:12px;text-align:right;margin-top:8px">${escapeText(source)}</div>`,
    );
  }

  return { Front: front, Back: backParts.join('\n') };
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

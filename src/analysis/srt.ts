export interface RawCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

const TIMESTAMP_RE =
  /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

const HTML_TAG_RE = /<[^>]+>/g;

function timestampToMs(h: string, m: string, s: string, ms: string): number {
  return (
    parseInt(h, 10) * 3_600_000 +
    parseInt(m, 10) * 60_000 +
    parseInt(s, 10) * 1000 +
    parseInt(ms.padEnd(3, '0').slice(0, 3), 10)
  );
}

function stripTags(text: string): string {
  return text.replace(HTML_TAG_RE, '').replace(/\r/g, '').trim();
}

export function parseSrt(content: string): RawCue[] {
  const blocks = content.replace(/﻿/g, '').split(/\r?\n\r?\n+/);
  const cues: RawCue[] = [];
  let runningIndex = 1;

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    let cursor = 0;
    let parsedIndex = runningIndex;
    const indexCandidate = lines[cursor];
    if (/^\d+$/.test(indexCandidate.trim())) {
      parsedIndex = parseInt(indexCandidate.trim(), 10);
      cursor += 1;
    }

    if (cursor >= lines.length) continue;
    const tsMatch = TIMESTAMP_RE.exec(lines[cursor]);
    if (!tsMatch) continue;
    cursor += 1;

    const startMs = timestampToMs(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4]);
    const endMs = timestampToMs(tsMatch[5], tsMatch[6], tsMatch[7], tsMatch[8]);
    const text = stripTags(lines.slice(cursor).join('\n'));
    if (text.length === 0) continue;

    cues.push({ index: parsedIndex, startMs, endMs, text });
    runningIndex = parsedIndex + 1;
  }

  cues.sort((a, b) => a.startMs - b.startMs);
  return cues.map((c, i) => ({ ...c, index: i + 1 }));
}

export interface FilenameDetection {
  seriesName: string | null;
  episodeNumber: number | null;
}

const TAG_BLOCK_RE = /[\[\(\{][^\]\)\}]*[\]\)\}]/g;
const EXTENSION_RE = /\.[A-Za-z0-9]{1,5}$/;

const EPISODE_PATTERNS: { re: RegExp; group: number }[] = [
  { re: /S\d{1,3}\s*E(\d{1,3})/i, group: 1 },
  { re: /\bEp(?:isode)?\.?\s*(\d{1,3})\b/i, group: 1 },
  { re: /\bEP\.?\s*(\d{1,3})\b/i, group: 1 },
  { re: /第\s*(\d{1,3})\s*話/, group: 1 },
  { re: /#\s*(\d{1,3})\b/, group: 1 },
  { re: /[\s_\-]\s*(\d{1,3})\s*(?:v\d+)?\s*(?=[\s_\-\.\[]|$)/, group: 1 },
];

export function detectFromFilename(filename: string): FilenameDetection {
  const base = filename.replace(EXTENSION_RE, '');
  const stripped = base.replace(TAG_BLOCK_RE, ' ').replace(/\s+/g, ' ').trim();

  let episodeNumber: number | null = null;
  let matchStart = -1;
  let matchEnd = -1;

  for (const { re, group } of EPISODE_PATTERNS) {
    const m = re.exec(stripped);
    if (m && m[group] != null) {
      episodeNumber = parseInt(m[group], 10);
      matchStart = m.index;
      matchEnd = m.index + m[0].length;
      break;
    }
  }

  let seriesName: string | null = null;
  if (matchStart >= 0) {
    seriesName = stripped.slice(0, matchStart);
  } else {
    seriesName = stripped;
  }
  seriesName = seriesName
    .replace(/[_\.]/g, ' ')
    .replace(/[\-—]+\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (seriesName.length === 0) seriesName = null;

  // If we matched and the rest of the string after the match has more text,
  // it might be the actual title (e.g., "12 - Title.mkv" -> series "Title").
  // Heuristic: keep the longer side.
  if (matchEnd > 0) {
    const after = stripped
      .slice(matchEnd)
      .replace(/^[\s\-_\.]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const before = seriesName ?? '';
    if (after.length > before.length * 2 && after.length > 3) {
      seriesName = after;
    }
  }

  return { seriesName, episodeNumber };
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(EXTENSION_RE, '');
  return base
    .replace(TAG_BLOCK_RE, ' ')
    .replace(/[_\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

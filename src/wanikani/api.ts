/**
 * WaniKani v2 API client.
 *
 * Pureyaa only reads the kanji subjects (and /user as a key sanity check),
 * so this is a tiny wrapper over fetch — no SDK, no caching here. The
 * caller decides what to persist.
 *
 * Auth is a personal access token from https://www.wanikani.com/settings/personal_access_tokens.
 * We send `Authorization: Bearer <token>` and pin a known API revision.
 */

const WK_BASE = 'https://api.wanikani.com/v2';
const WK_REVISION = '20170710';

interface WKMeaning {
  meaning: string;
  primary: boolean;
}

interface WKReading {
  reading: string;
  primary: boolean;
  type: 'onyomi' | 'kunyomi' | 'nanori';
}

interface WKKanjiSubject {
  id: number;
  object: 'kanji';
  data: {
    characters: string;
    level: number;
    meanings: WKMeaning[];
    readings: WKReading[];
    document_url: string;
  };
}

interface WKCollection<T> {
  data: T[];
  pages: { next_url: string | null; per_page: number };
  total_count: number;
  data_updated_at: string;
}

interface WKUser {
  data: { username: string; level: number };
}

export interface KanjiInfo {
  /** The kanji character (e.g. "病"). */
  character: string;
  /** WaniKani level 1–60. */
  level: number;
  /** Primary meaning(s) first, then alternates. */
  meanings: string[];
  /** On'yomi readings as returned by WK (hiragana). Primary first. */
  onyomi: string[];
  /** Kun'yomi readings (hiragana). Primary first. */
  kunyomi: string[];
  /** WK lesson page URL. */
  documentUrl: string;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Wanikani-Revision': WK_REVISION,
  };
}

async function wkFetchJson<T>(url: string, apiKey: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders(apiKey) });
  } catch (e) {
    throw new Error(`WaniKani network error: ${(e as Error).message}`);
  }
  if (res.status === 401) throw new Error('WaniKani API key rejected (401).');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WaniKani HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** Cheap key-validity check. Returns the WK username + level on success. */
export async function testWanikaniApiKey(apiKey: string): Promise<{ username: string; level: number }> {
  const json = await wkFetchJson<WKUser>(`${WK_BASE}/user`, apiKey);
  return { username: json.data.username, level: json.data.level };
}

function compactSubject(s: WKKanjiSubject): KanjiInfo {
  const meanings: string[] = [];
  for (const m of s.data.meanings) {
    if (m.primary) meanings.unshift(m.meaning);
    else meanings.push(m.meaning);
  }
  const onyomi: string[] = [];
  const kunyomi: string[] = [];
  for (const r of s.data.readings) {
    const bucket = r.type === 'onyomi' ? onyomi : r.type === 'kunyomi' ? kunyomi : null;
    if (!bucket) continue;
    if (r.primary) bucket.unshift(r.reading);
    else bucket.push(r.reading);
  }
  return {
    character: s.data.characters,
    level: s.data.level,
    meanings,
    onyomi,
    kunyomi,
    documentUrl: s.data.document_url,
  };
}

/**
 * Bulk-fetch every WK kanji subject (~2k entries, 2–3 pages at per_page=1000).
 * Returns a character→info map ready to persist as the local cache.
 */
export async function fetchAllWanikaniKanji(
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, KanjiInfo>> {
  const out: Record<string, KanjiInfo> = {};
  let url: string | null = `${WK_BASE}/subjects?types=kanji&per_page=1000`;
  let total = 0;
  while (url) {
    const page: WKCollection<WKKanjiSubject> = await wkFetchJson<WKCollection<WKKanjiSubject>>(url, apiKey);
    if (total === 0) total = page.total_count;
    for (const subject of page.data) {
      const info = compactSubject(subject);
      if (info.character) out[info.character] = info;
    }
    onProgress?.(Object.keys(out).length, total);
    url = page.pages.next_url;
  }
  return out;
}

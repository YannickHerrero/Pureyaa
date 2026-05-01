import type { ModelId } from '@/types';

export interface CueTranslation {
  index: number;
  translation: string;
  grammarNote: string | null;
}

export interface TranslateOptions {
  apiKey: string;
  model: ModelId;
  cues: { index: number; text: string }[];
  signal?: AbortSignal;
  onItem?: (item: CueTranslation) => void;
  onLog?: (msg: string) => void;
}

const MODEL_IDS: Record<ModelId, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
};

const SYSTEM_PROMPT = `You are translating Japanese subtitles to English for a language-learner.

Rules:
- Translate every line. Use the entire script as context for accuracy and pronoun/subject inference.
- Keep translations natural — match register, do not over-literalize.
- Add a grammarNote ONLY when there is something genuinely instructive: a non-obvious grammar pattern, idiom, register/formality marker, or untranslatable nuance. Otherwise set grammarNote to null. Keep notes terse — one or two sentences max.
- Output a JSON array with one entry per cue: { "index": number, "translation": string, "grammarNote": string | null }.
- Output ONLY the JSON array. No prose, no code fences, no commentary.`;

// RN's fetch buffers response bodies — `res.body` is null even for streaming
// SSE responses. XHR exposes `responseText` progressively as chunks arrive,
// so we use that to parse Claude's stream incrementally.
function streamingPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    let lastIndex = 0;

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3) {
        const text = xhr.responseText;
        if (text.length > lastIndex) {
          onChunk(text.slice(lastIndex));
          lastIndex = text.length;
        }
      }
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Claude API error ${xhr.status}: ${xhr.responseText.slice(0, 500)}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error talking to Claude'));

    if (signal) {
      const onAbort = () => {
        xhr.abort();
        reject(new Error('Cancelled'));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort);
    }

    xhr.send(body);
  });
}

export async function translateCues(opts: TranslateOptions): Promise<CueTranslation[]> {
  const { apiKey, model, cues, signal, onItem, onLog } = opts;
  const userMessage = cues.map((c) => `[${c.index}] ${c.text}`).join('\n');

  const parser = new IncrementalArrayParser();
  const items: CueTranslation[] = [];
  let parseFailures = 0;
  parser.onItem = (raw) => {
    const it = normalize(raw);
    if (!it) {
      parseFailures += 1;
      onLog?.(`claude: object failed validation: ${JSON.stringify(raw).slice(0, 120)}`);
      return;
    }
    items.push(it);
    onItem?.(it);
  };

  let buffer = '';
  let allText = '';
  let chunkCount = 0;
  let firstChunk = true;

  await streamingPost(
    'https://api.anthropic.com/v1/messages',
    JSON.stringify({
      model: MODEL_IDS[model],
      max_tokens: 16384,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
    {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    (chunk) => {
      chunkCount += 1;
      if (firstChunk) {
        onLog?.(`claude: first chunk (${chunk.length} bytes)`);
        firstChunk = false;
      }
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const t = evt.delta.text ?? '';
            allText += t;
            parser.push(t);
          }
        } catch {
          // skip malformed line
        }
      }
    },
    signal,
  );

  onLog?.(
    `claude: stream done — ${chunkCount} chunks, ${allText.length} text chars, ` +
      `${items.length} items, ${parseFailures} validation failures`,
  );

  if (items.length === 0) {
    const head = allText.slice(0, 400);
    throw new Error(
      `Claude returned 0 valid translations. ` +
        `Got ${allText.length} text chars, ${parseFailures} unrecognized objects. ` +
        `First 400 chars of response: ${head || '(empty)'}`,
    );
  }

  return items;
}

function normalize(raw: unknown): CueTranslation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const index = typeof r.index === 'number' ? r.index : Number(r.index);
  const translation = typeof r.translation === 'string' ? r.translation : null;
  if (!Number.isFinite(index) || translation == null) return null;
  const note = r.grammarNote;
  const grammarNote =
    typeof note === 'string' && note.trim().length > 0 ? note : null;
  return { index, translation, grammarNote };
}

/**
 * Incrementally extracts top-level objects from a streaming JSON array.
 * Handles partial chunks; emits each completed object via onItem.
 * Tolerant of leading/trailing whitespace, code-fence wrappers (```json),
 * and the wrapping `[` / `]`.
 */
export class IncrementalArrayParser {
  onItem: (obj: unknown) => void = () => {};
  private buffer = '';
  private scanPos = 0; // resume position within buffer across push() calls
  private inObject = false;
  private depth = 0;
  private inString = false;
  private escaped = false;

  push(chunk: string): void {
    this.buffer += chunk;

    if (!this.inObject) {
      while (this.scanPos < this.buffer.length) {
        const c = this.buffer[this.scanPos];
        if (c === '{') {
          // Drop everything before the object so objStart is at index 0.
          this.buffer = this.buffer.slice(this.scanPos);
          this.scanPos = 0;
          this.inObject = true;
          this.depth = 0;
          this.inString = false;
          this.escaped = false;
          break;
        }
        // Anything else (whitespace, '[', ']', commas, code-fence chars,
        // 'json' label, etc.) — skip past it.
        this.scanPos++;
      }
      if (!this.inObject) {
        // No '{' found; trim what we've already scanned to keep buffer small.
        this.buffer = this.buffer.slice(this.scanPos);
        this.scanPos = 0;
        return;
      }
    }

    for (let i = this.scanPos; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (this.inString) {
        if (this.escaped) {
          this.escaped = false;
        } else if (ch === '\\') {
          this.escaped = true;
        } else if (ch === '"') {
          this.inString = false;
        }
        continue;
      }
      if (ch === '"') {
        this.inString = true;
        continue;
      }
      if (ch === '{') this.depth++;
      else if (ch === '}') {
        this.depth--;
        if (this.depth === 0) {
          const slice = this.buffer.slice(0, i + 1);
          this.buffer = this.buffer.slice(i + 1);
          this.scanPos = 0;
          this.inObject = false;
          try {
            this.onItem(JSON.parse(slice));
          } catch {
            // discard malformed object
          }
          // Look for the next object in the remaining buffer.
          this.push('');
          return;
        }
      }
    }
    // Reached end of buffer without closing — resume here on the next chunk.
    this.scanPos = this.buffer.length;
  }
}

export async function testApiKey(apiKey: string, model: ModelId): Promise<void> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_IDS[model],
      max_tokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

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

export async function translateCues(opts: TranslateOptions): Promise<CueTranslation[]> {
  const { apiKey, model, cues, signal, onItem } = opts;
  const userMessage = cues.map((c) => `[${c.index}] ${c.text}`).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_IDS[model],
      max_tokens: 16384,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const parser = new IncrementalArrayParser();
  const items: CueTranslation[] = [];
  parser.onItem = (raw) => {
    const it = normalize(raw);
    if (!it) return;
    items.push(it);
    onItem?.(it);
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
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
          parser.push(evt.delta.text ?? '');
        }
      } catch {
        // skip malformed line
      }
    }
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
 * Tolerant of leading/trailing whitespace and the wrapping `[` / `]`.
 */
export class IncrementalArrayParser {
  onItem: (obj: unknown) => void = () => {};
  private buffer = '';
  private depth = 0;
  private inString = false;
  private escaped = false;
  private objStart = -1;
  private started = false;

  push(chunk: string): void {
    this.buffer += chunk;
    while (this.objStart === -1 && this.buffer.length > 0) {
      const c = this.buffer[0];
      if (c === '[' || c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === ',') {
        if (c === '[') this.started = true;
        this.buffer = this.buffer.slice(1);
        continue;
      }
      if (c === '{') {
        this.objStart = 0;
        this.depth = 0;
        this.inString = false;
        this.escaped = false;
        break;
      }
      // anything else (e.g. ']' end-of-array) — drop one char
      this.buffer = this.buffer.slice(1);
    }
    if (this.objStart === -1) return;

    for (let i = this.objStart; i < this.buffer.length; i++) {
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
          this.objStart = -1;
          try {
            this.onItem(JSON.parse(slice));
          } catch {
            // discard malformed object
          }
          // continue scanning for next object
          this.push('');
          return;
        }
      }
    }
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

/**
 * Whisper transcription via OpenRouter.
 *
 * OpenRouter's /audio/transcriptions endpoint diverges from OpenAI's
 * multipart contract — it expects a JSON body with the audio payload
 * inline as base64 under `input_audio: { data, format }`. We ask for
 * `verbose_json` (segments with start/end seconds) and build the SRT
 * ourselves, because OR was observed to silently strip timestamps when
 * `response_format: "srt"` was requested — leaving the parser with a
 * timestampless transcript and "no cues found".
 *
 * Model: whisper-large-v3-turbo. ~12% WER multilingual including
 * Japanese, ~216× real-time at most providers — a 24-min episode
 * transcribes in single-digit seconds of compute. Network upload of
 * the base64'd audio dominates wall time (~33% inflation from base64).
 */

import { File } from 'expo-file-system';
import { authHeaders, OPENROUTER_BASE } from './client';

const WHISPER_MODEL = 'openai/whisper-large-v3-turbo';

export interface TranscribeOptions {
  apiKey: string;
  /** file:// URI of the extracted audio. */
  audioUri: string;
  /**
   * Format hint — extension-style string like 'm4a', 'mp3', 'ogg', 'wav'.
   * Whisper auto-detects from the bytes anyway, but the API requires it.
   */
  audioFormat: string;
  /** ISO 639-1 code. Defaults to 'ja' since this app is Japanese-focused. */
  language?: string;
}

interface VerboseJsonResponse {
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  error?: { message?: string };
}

/**
 * Read the audio, base64-encode it, POST to /audio/transcriptions, and
 * return the SRT text we built from the response's segments. Throws on
 * network errors, non-2xx responses, or a response with no timestamped
 * segments.
 */
export async function transcribeToSrt(opts: TranscribeOptions): Promise<string> {
  const { apiKey, audioUri, audioFormat, language = 'ja' } = opts;

  const audioBase64 = await new File(audioUri).base64();

  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({
        model: WHISPER_MODEL,
        input_audio: { data: audioBase64, format: audioFormat },
        language,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      }),
    });
  } catch (e) {
    throw new Error(`Whisper network error: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Whisper HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  let json: VerboseJsonResponse;
  try {
    json = (await res.json()) as VerboseJsonResponse;
  } catch {
    throw new Error('Whisper response was not JSON.');
  }

  if (json.error?.message) {
    throw new Error(`Whisper: ${json.error.message}`);
  }

  const segments = json.segments;
  if (!segments || segments.length === 0) {
    const head = (json.text ?? '').slice(0, 200);
    throw new Error(
      `Whisper returned no timestamped segments. ` +
        `(text head: ${head ? JSON.stringify(head) : '<empty>'})`,
    );
  }

  return segmentsToSrt(segments);
}

function segmentsToSrt(segments: { start: number; end: number; text: string }[]): string {
  const out: string[] = [];
  let cueIdx = 1;
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    out.push(String(cueIdx));
    out.push(`${secondsToSrtTimestamp(seg.start)} --> ${secondsToSrtTimestamp(seg.end)}`);
    out.push(text);
    out.push('');
    cueIdx += 1;
  }
  return out.join('\n');
}

function secondsToSrtTimestamp(s: number): string {
  const safe = Math.max(0, s);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  // Edge case: rounding 0.9999 to 1.000 — borrow into seconds.
  const adjustedMs = ms === 1000 ? 999 : ms;
  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0') +
    ',' +
    String(adjustedMs).padStart(3, '0')
  );
}

/** Map a filename's extension to the format string OR's API expects. */
export function audioFormatForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'm4a':
      return 'm4a';
    case 'mp4':
      return 'mp4';
    case 'mp3':
      return 'mp3';
    case 'ogg':
    case 'opus':
      return 'ogg';
    case 'wav':
      return 'wav';
    case 'flac':
      return 'flac';
    case 'webm':
      return 'webm';
    default:
      return ext || 'm4a';
  }
}

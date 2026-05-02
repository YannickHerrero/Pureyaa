/**
 * Whisper transcription via OpenRouter.
 *
 * OpenRouter's /audio/transcriptions endpoint diverges from OpenAI's
 * multipart contract — it expects a JSON body with the audio payload
 * inline as base64 under `input_audio: { data, format }`. We always ask
 * for SRT directly so the rest of the pipeline (parser → tokenizer →
 * analysis) treats the result identically to a user-provided subtitle file.
 *
 * The model is whisper-large-v3-turbo: ~12% WER multilingual including
 * Japanese, ~216× real-time at most providers — a 24-minute episode
 * transcribes in single-digit seconds of compute. Network upload of the
 * base64'd audio dominates wall time (base64 inflates the payload by ~33%).
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

interface TranscriptionResponse {
  /** SRT/text/json content depending on response_format. With srt, this is the raw SRT. */
  text?: string;
  /** Some providers return the SRT under `srt`. */
  srt?: string;
  error?: { message?: string };
}

/**
 * Read the audio, base64-encode it, POST to /audio/transcriptions, and
 * return the SRT text. Throws on network or non-2xx responses.
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
        input_audio: {
          data: audioBase64,
          format: audioFormat,
        },
        language,
        response_format: 'srt',
      }),
    });
  } catch (e) {
    throw new Error(`Whisper network error: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Whisper HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  // Response can come back as either raw SRT text or as a JSON envelope
  // containing the SRT under `text`/`srt`. Handle both shapes.
  const contentType = res.headers.get('content-type') ?? '';
  let srt: string;
  if (contentType.includes('application/json')) {
    const json = (await res.json()) as TranscriptionResponse;
    srt = json.srt ?? json.text ?? '';
    if (!srt && json.error?.message) {
      throw new Error(`Whisper: ${json.error.message}`);
    }
  } else {
    srt = await res.text();
  }

  if (!srt.trim()) {
    throw new Error('Whisper returned an empty transcript.');
  }
  return srt;
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

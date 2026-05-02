/**
 * Whisper transcription via OpenRouter's OpenAI-compatible
 * /audio/transcriptions endpoint. We always ask for SRT directly so
 * the rest of the pipeline (parser → tokenizer → analysis) treats
 * the result identically to a user-provided subtitle file.
 *
 * The model is whisper-large-v3-turbo: ~12% WER multilingual including
 * Japanese, ~216× real-time at most providers — a 24-minute episode
 * transcribes in single-digit seconds of compute. Network upload of
 * the audio dominates wall time.
 */

import { authHeaders, OPENROUTER_BASE } from './client';

const WHISPER_MODEL = 'openai/whisper-large-v3-turbo';

export interface TranscribeOptions {
  apiKey: string;
  /** file:// URI of the extracted audio. */
  audioUri: string;
  /** MIME type of the audio file. Whisper accepts mp3/mp4/m4a/wav/ogg/webm/flac. */
  audioMime: string;
  /** ISO 639-1 code. Defaults to 'ja' since this app is Japanese-focused. */
  language?: string;
}

/**
 * POST the audio file as multipart and return the SRT text as a string.
 * Throws on network errors or non-2xx responses.
 */
export async function transcribeToSrt(opts: TranscribeOptions): Promise<string> {
  const { apiKey, audioUri, audioMime, language = 'ja' } = opts;
  const filename = audioUri.split('/').pop() ?? 'audio.m4a';

  const formData = new FormData();
  // RN's FormData accepts the {uri, type, name} object form for file uploads.
  // The cast satisfies the DOM-typed FormData signature without runtime cost.
  formData.append(
    'file',
    { uri: audioUri, type: audioMime, name: filename } as unknown as Blob,
  );
  formData.append('model', WHISPER_MODEL);
  formData.append('language', language);
  formData.append('response_format', 'srt');

  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        // Don't set Content-Type — fetch sets the multipart boundary itself.
        ...authHeaders(apiKey),
      },
      body: formData,
    });
  } catch (e) {
    throw new Error(`Whisper network error: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Whisper HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const srt = await res.text();
  if (!srt.trim()) {
    throw new Error('Whisper returned an empty transcript.');
  }
  return srt;
}

function audioMimeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}

export { audioMimeForFilename };

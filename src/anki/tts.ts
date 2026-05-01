/**
 * Google Cloud Text-to-Speech client.
 *
 * Uses the `text:synthesize` REST endpoint with API key auth — no SDK,
 * just fetch with a JSON body. Response is `{ audioContent: <base64 mp3> }`,
 * which we hand straight to the Anki bridge's `storeMedia`.
 *
 * Pricing (May 2026): Chirp 3 HD voices are $30 per 1M chars; the first
 * 1M chars per month are free, which covers any realistic mining usage.
 */

const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

export interface TtsResult {
  /** Filename to use in the [sound:...] field. */
  filename: string;
  /** Base64-encoded mp3 — pass straight to AnkiBridge.storeMedia. */
  base64: string;
}

export async function synthesizeJapanese(args: {
  text: string;
  voiceName: string;
  apiKey: string;
  outputId: string;
}): Promise<TtsResult> {
  const { text, voiceName, apiKey, outputId } = args;
  const url = `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({
    input: { text },
    voice: { languageCode: 'ja-JP', name: voiceName },
    audioConfig: { audioEncoding: 'MP3' },
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch (e) {
    throw new Error(`Google TTS network error: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Google TTS HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  let json: { audioContent?: string };
  try {
    json = await res.json();
  } catch {
    throw new Error('Google TTS returned non-JSON');
  }

  if (!json.audioContent) {
    throw new Error('Google TTS response missing audioContent');
  }

  return {
    filename: `pureyaa_tts_${outputId}.mp3`,
    base64: json.audioContent,
  };
}

/** Quick health check used by the settings test button. */
export async function testGoogleTts(apiKey: string, voiceName: string): Promise<void> {
  await synthesizeJapanese({
    text: 'テスト',
    voiceName,
    apiKey,
    outputId: 'health',
  });
}

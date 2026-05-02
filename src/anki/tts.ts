/**
 * Japanese text-to-speech via OpenRouter.
 *
 * OpenRouter doesn't expose a dedicated /audio/speech endpoint; instead,
 * audio output happens through the chat-completions API with the audio
 * modality enabled on `openai/gpt-4o-audio-preview`. The response carries
 * the synthesized audio as base64 mp3 inside `choices[0].message.audio.data`,
 * which we hand straight to AnkiBridge.storeMedia for the card.
 *
 * Quality on Japanese is below Google's Chirp 3 HD voices, but the
 * single-key tradeoff is worth it for this app's scope.
 */

import { authHeaders, OPENROUTER_BASE } from '@/openrouter/client';

const TTS_MODEL = 'openai/gpt-4o-audio-preview';

export interface TtsResult {
  /** Filename to use in the [sound:...] field. */
  filename: string;
  /** Base64-encoded mp3 — pass straight to AnkiBridge.storeMedia. */
  base64: string;
}

interface ChatAudioResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string;
        format?: string;
      };
    };
  }>;
  error?: { message?: string };
}

export async function synthesizeJapanese(args: {
  text: string;
  voiceName: string;
  apiKey: string;
  outputId: string;
}): Promise<TtsResult> {
  const { text, voiceName, apiKey, outputId } = args;

  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        modalities: ['text', 'audio'],
        audio: { voice: voiceName, format: 'mp3' },
        messages: [{ role: 'user', content: text }],
      }),
    });
  } catch (e) {
    throw new Error(`OpenRouter TTS network error: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenRouter TTS HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  let json: ChatAudioResponse;
  try {
    json = (await res.json()) as ChatAudioResponse;
  } catch {
    throw new Error('OpenRouter TTS returned non-JSON');
  }

  const audio = json.choices?.[0]?.message?.audio?.data;
  if (!audio) {
    throw new Error(
      `OpenRouter TTS response missing audio data` +
        (json.error?.message ? ` (${json.error.message})` : ''),
    );
  }

  return {
    filename: `pureyaa_tts_${outputId}.mp3`,
    base64: audio,
  };
}

/** Quick health check used by the settings test button (synthesizes "テスト"). */
export async function testTts(apiKey: string, voiceName: string): Promise<void> {
  await synthesizeJapanese({
    text: 'テスト',
    voiceName,
    apiKey,
    outputId: 'health',
  });
}

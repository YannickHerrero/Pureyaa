import type { AnkiSettings } from '@/types';
import { AnkiClient } from './client';
import type { CardAssets } from './buildCard';

export const PUREYAA_MODEL_NAME = 'Pureyaa Sentence';

/**
 * The order MUST match `PUREYAA_FIELDS` in `AnkiBridgeModule.kt`. AnkiDroid
 * expects fields as a positional array, not a name→value map.
 */
const FIELD_ORDER = [
  'Image',
  'Audio',
  'JapaneseRuby',
  'JapanesePlain',
  'English',
  'GrammarNote',
  'FocusWord',
  'FocusReading',
  'FocusGlosses',
  'Source',
] as const;

// AnkiDroid's AddContentApi.formatMediaName uses literal string equality
// against "audio" / "image" — full MIME types like "image/jpeg" are
// rejected and addMediaFromUri returns null. Pass the bare category only.
function pickMimeType(filename: string): 'image' | 'audio' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'gif':
      return 'image';
    case 'mp3':
    case 'm4a':
    case 'mp4':
    case 'aac':
    case 'ogg':
    case 'opus':
    case 'wav':
    case 'flac':
      return 'audio';
    default:
      throw new Error(`Unsupported media extension for AnkiDroid: ${filename}`);
  }
}

/**
 * Send a fully-built card to AnkiDroid via the native bridge.
 * - ensures the Pureyaa Sentence model exists (installs on first send)
 * - ensures the deck exists (creates on first send)
 * - uploads each media file via FileProvider-shared URIs
 * - adds the note with all 10 fields populated
 */
export async function sendCardToAnki(
  assets: CardAssets,
  fields: Record<string, string>,
  settings: AnkiSettings,
): Promise<number> {
  await AnkiClient.ensurePureyaaModel();
  await AnkiClient.ensureDeck(settings.defaultDeckName);

  // AnkiDroid may store the file under a slightly different name than we
  // asked for (e.g. extension handled by the provider, dedup suffix). The
  // return value of addMediaFromUri is the already-formatted reference
  // string `<img src="…" />` / `[sound:…]` built from the *actually stored*
  // filename — that's what the card field has to point to.
  const fieldsWithMedia = { ...fields };
  for (const m of assets.media) {
    const mimeType = pickMimeType(m.filename);
    // AnkiDroid docs: preferredName must NOT include a file extension —
    // the provider derives the extension from the source URI's content type.
    const preferredName = m.filename.replace(/\.[^/.]+$/, '');
    const ref = await AnkiClient.storeMedia(m.base64, preferredName, mimeType);
    if (mimeType === 'image') {
      fieldsWithMedia.Image = ref;
    } else {
      fieldsWithMedia.Audio = ref;
    }
  }

  const orderedFields = FIELD_ORDER.map((k) => fieldsWithMedia[k] ?? '');

  return AnkiClient.addNote(
    settings.defaultDeckName,
    PUREYAA_MODEL_NAME,
    orderedFields,
    ['pureyaa'],
  );
}

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

function pickMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    default:
      return 'application/octet-stream';
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

  for (const m of assets.media) {
    await AnkiClient.storeMedia(m.base64, m.filename, pickMimeType(m.filename));
  }

  const orderedFields = FIELD_ORDER.map((k) => fields[k] ?? '');

  return AnkiClient.addNote(
    settings.defaultDeckName,
    PUREYAA_MODEL_NAME,
    orderedFields,
    ['pureyaa'],
  );
}

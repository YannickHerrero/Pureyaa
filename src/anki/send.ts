import type { AnkiSettings } from '@/types';
import { makeAnkiClient } from './client';
import { ensurePureyaaModel, PUREYAA_MODEL_NAME } from './model';
import type { CardAssets } from './buildCard';

/**
 * Send a fully-built card to AnkiDroid via AnkiConnect.
 * - ensures the Pureyaa Sentence model exists
 * - creates the deck (no-op if it already exists)
 * - uploads each media file
 * - adds the note
 *
 * Returns the new Anki note id.
 */
export async function sendCardToAnki(
  assets: CardAssets,
  fields: Record<string, string>,
  settings: AnkiSettings,
): Promise<number> {
  const client = makeAnkiClient(settings.ankiConnectUrl.trim());

  await ensurePureyaaModel(client);
  // createDeck is idempotent on AnkiConnect — it returns the existing id if
  // the deck already exists.
  await client.createDeck(settings.defaultDeckName);

  for (const m of assets.media) {
    await client.storeMediaFile(m.filename, m.base64);
  }

  return client.addNote({
    deckName: settings.defaultDeckName,
    modelName: PUREYAA_MODEL_NAME,
    fields,
    tags: ['pureyaa'],
  });
}

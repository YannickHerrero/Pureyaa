import type { AnkiSettings } from '@/types';
import { makeAnkiClient } from './client';
import { packIntoBasicFields } from './pack';
import type { CardAssets } from './buildCard';

const BASIC_MODEL = 'Basic';

/**
 * Send a fully-built card to AnkiDroid via AnkiConnect.
 *
 * AnkiconnectAndroid doesn't implement createModel or createDeck, so we use
 * AnkiDroid's built-in "Basic" note type and assume the configured deck
 * already exists ("Default" always does — the user can create others in
 * AnkiDroid manually if they want).
 */
export async function sendCardToAnki(
  assets: CardAssets,
  fields: Record<string, string>,
  settings: AnkiSettings,
): Promise<number> {
  const client = makeAnkiClient(settings.ankiConnectUrl.trim());

  for (const m of assets.media) {
    await client.storeMediaFile(m.filename, m.base64);
  }

  return client.addNote({
    deckName: settings.defaultDeckName,
    modelName: BASIC_MODEL,
    fields: packIntoBasicFields(fields),
    tags: ['pureyaa'],
  });
}

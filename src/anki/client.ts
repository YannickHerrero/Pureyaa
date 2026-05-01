/**
 * Thin JS wrapper over the AnkiBridge native module.
 *
 * Replaces the previous AnkiConnect-over-HTTP client. Each method is a
 * direct call into AnkiDroid's AddContentApi via our Kotlin module — no
 * sideloaded service, no localhost server, no JSON-RPC.
 */

import { AnkiBridge } from 'anki-bridge';

export class AnkiBridgeError extends Error {
  readonly kind:
    | 'not_installed'
    | 'no_permission'
    | 'permission_denied'
    | 'rpc';
  constructor(kind: AnkiBridgeError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

export const AnkiClient = {
  isAvailable(): boolean {
    return AnkiBridge.isAnkiDroidInstalled();
  },

  hasPermission(): Promise<boolean> {
    return AnkiBridge.hasPermission();
  },

  async requestPermission(): Promise<boolean> {
    const res = await AnkiBridge.requestPermission();
    return !!res?.granted;
  },

  deckNames(): Promise<string[]> {
    return AnkiBridge.getDeckNames();
  },

  modelNames(): Promise<string[]> {
    return AnkiBridge.getModelNames();
  },

  ensureDeck(name: string): Promise<number> {
    return AnkiBridge.ensureDeck(name);
  },

  ensurePureyaaModel(): Promise<number> {
    return AnkiBridge.ensurePureyaaModel();
  },

  storeMedia(base64: string, filename: string, mimeType: string): Promise<string> {
    return AnkiBridge.storeMedia(base64, filename, mimeType);
  },

  addNote(
    deckName: string,
    modelName: string,
    fields: string[],
    tags: string[] = [],
  ): Promise<number> {
    return AnkiBridge.addNote(deckName, modelName, fields, tags);
  },
};

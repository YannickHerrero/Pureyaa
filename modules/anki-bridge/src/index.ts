import { requireNativeModule } from 'expo-modules-core';

interface PermissionResponse {
  granted: boolean;
  canAskAgain?: boolean;
  status?: string;
}

interface AnkiBridgeNativeModule {
  isAnkiDroidInstalled(): boolean;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<PermissionResponse>;
  getDeckNames(): Promise<string[]>;
  getModelNames(): Promise<string[]>;
  ensureDeck(name: string): Promise<number>;
  ensurePureyaaModel(): Promise<number>;
  addNote(
    deckName: string,
    modelName: string,
    fields: string[],
    tags: string[],
  ): Promise<number>;
  storeMedia(base64: string, filename: string, mimeType: string): Promise<string>;
  /**
   * Tell Android we want to keep reading this content:// URI across app
   * restarts. Call once, right after a DocumentPicker returns a URI you
   * plan to persist into storage. Silently no-ops on non-persistable URIs.
   */
  persistUriPermission(uri: string): Promise<void>;
}

const native = requireNativeModule<AnkiBridgeNativeModule>('AnkiBridge');

export const AnkiBridge = native;
export type { PermissionResponse };

import { Platform } from 'react-native';
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

/**
 * On iOS the native module isn't registered (the integration target is
 * AnkiDroid, which only exists on Android). Importing AnkiBridge at the
 * top of a file would throw at module-load time on iOS even when the
 * code path that calls Anki is gated behind ANKI_AVAILABLE. The proxy
 * keeps imports safe and gives a clear error if anything slips through.
 */
function unavailableShim(): AnkiBridgeNativeModule {
  return new Proxy({} as AnkiBridgeNativeModule, {
    get(_target, prop) {
      // isAnkiDroidInstalled is sync and used in feature-detection paths
      // that should resolve to "no" on iOS rather than throw.
      if (prop === 'isAnkiDroidInstalled') return () => false;
      return () =>
        Promise.reject(
          new Error(`AnkiBridge.${String(prop)} is not available on iOS.`),
        );
    },
  });
}

const native: AnkiBridgeNativeModule =
  Platform.OS === 'android'
    ? requireNativeModule<AnkiBridgeNativeModule>('AnkiBridge')
    : unavailableShim();

export const AnkiBridge = native;
export type { PermissionResponse };

/**
 * Platform-aware feature flags. Single source of truth so we don't sprinkle
 * `Platform.OS === 'android'` checks across the UI.
 */

import { Platform } from 'react-native';

/**
 * Whether the Anki integration (DictPopup +Anki button, Settings → Anki
 * section, library context-menu Anki actions, AnkiPreviewSheet, …) is
 * available on the current platform. AnkiDroid's AddContentApi has no
 * iOS counterpart that lets us add notes with embedded media in the
 * background, so on iOS the entire surface is hidden.
 */
export const ANKI_AVAILABLE = Platform.OS === 'android';

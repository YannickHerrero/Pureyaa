export const STORAGE_KEYS = {
  entries: 'pureyaa.entries.v1',
  savedWords: 'pureyaa.savedWords.v1',
  settings: 'pureyaa.settings.v1',
  onboarded: 'pureyaa.onboarded.v1',
  recentRetimers: 'pureyaa.recentRetimers.v1',
  ankiSettings: 'pureyaa.ankiSettings.v1',
  wanikaniKanjiCache: 'pureyaa.wanikaniKanjiCache.v1',
} as const;

export const SECURE_KEYS = {
  openrouterApiKey: 'pureyaa.openrouterApiKey',
  wanikaniApiKey: 'pureyaa.wanikaniApiKey',
} as const;

/**
 * Old SecureStore slots from the multi-provider era. Cleared once when the
 * user saves their first OpenRouter key (see settings.ts) so the device
 * doesn't keep dead Anthropic / Google credentials around forever.
 */
export const LEGACY_SECURE_KEYS = [
  'pureyaa.anthropicApiKey',
  'pureyaa.googleTtsApiKey',
] as const;

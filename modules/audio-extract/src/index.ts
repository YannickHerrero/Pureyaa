import { requireNativeModule } from 'expo-modules-core';

interface AudioExtractNativeModule {
  extractAudio(srcUri: string, startMs: number, endMs: number, outPath: string): Promise<string>;
}

const native = requireNativeModule<AudioExtractNativeModule>('AudioExtract');

export interface ExtractAudioOptions {
  startMs: number;
  endMs: number;
  outPath: string;
}

/**
 * Extract a time range of the audio track from a video file at `srcUri`
 * and write it as MP4-container audio (.m4a) at `outPath`.
 *
 * Returns the absolute path of the written file.
 *
 * Caveat: the clip can start up to ~1s before `startMs` because seeking
 * lands on the previous AAC sync sample. Use a small `startMs` epsilon if
 * you need precise alignment.
 */
export async function extractAudio(
  srcUri: string,
  opts: ExtractAudioOptions,
): Promise<string> {
  return native.extractAudio(srcUri, opts.startMs, opts.endMs, opts.outPath);
}

import * as VideoThumbnails from 'expo-video-thumbnails';
import { File } from 'expo-file-system';

export interface ThumbnailResult {
  uri: string;
  durationSeconds: number;
  aspectRatio: number;
}

/**
 * Extract a thumbnail at the given fraction of the video duration (default 10%)
 * and copy it to a stable destination path. Returns the saved uri plus enough
 * metadata for the entry tile (duration + aspect ratio).
 *
 * Note: expo-video-thumbnails returns width/height of the thumbnail (= the
 * frame's dimensions), so we use that for aspect ratio. Duration is not
 * provided by this API — caller supplies it from the video player on first
 * load if not yet known.
 */
export async function extractThumbnail(
  videoUri: string,
  destPath: string,
  positionMs: number,
): Promise<{ uri: string; width: number; height: number }> {
  const { uri, width, height } = await VideoThumbnails.getThumbnailAsync(videoUri, {
    time: positionMs,
    quality: 0.7,
  });
  new File(uri).copy(new File(destPath));
  return { uri: destPath, width, height };
}

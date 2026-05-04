import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { FileAccess } from 'file-access';

/**
 * Verify a stored file handle is still readable.
 *
 * On Android the handle is the content:// URI — `new File(uri).exists`
 * works directly because expo-file-system understands content URIs.
 *
 * On iOS the handle is a security-scoped bookmark blob; we have to
 * resolve it via FileAccess.beginSession before checking. If the
 * bookmark resolves cleanly the file is reachable; if resolution
 * throws (file deleted, moved, offloaded from iCloud, …) we report
 * the URI as gone so the library shows the relocate badge.
 */
export async function uriExists(uri: string): Promise<boolean> {
  if (!uri) return false;
  if (Platform.OS === 'android') {
    try {
      return new File(uri).exists;
    } catch {
      // SAF / content URIs may throw — best-effort assume present so we
      // don't false-flag every tile every time.
      return true;
    }
  }
  // iOS path: resolve bookmark, then check.
  try {
    const url = await FileAccess.beginSession(uri);
    try {
      return new File(url).exists;
    } finally {
      FileAccess.endSession(uri).catch(() => {});
    }
  } catch {
    return false;
  }
}

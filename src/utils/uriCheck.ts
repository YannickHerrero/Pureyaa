import * as FileSystem from 'expo-file-system';

export async function uriExists(uri: string): Promise<boolean> {
  try {
    if (!uri) return false;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    // SAF / content URIs may throw — best-effort assume present so we
    // don't false-flag every tile every time.
    return true;
  }
}

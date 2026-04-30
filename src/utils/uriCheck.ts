import { File } from 'expo-file-system';

export async function uriExists(uri: string): Promise<boolean> {
  try {
    if (!uri) return false;
    return new File(uri).exists;
  } catch {
    // SAF / content URIs may throw — best-effort assume present so we
    // don't false-flag every tile every time.
    return true;
  }
}

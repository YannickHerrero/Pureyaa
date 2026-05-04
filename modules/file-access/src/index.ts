import { requireNativeModule } from 'expo-modules-core';

interface FileAccessNativeModule {
  /**
   * Take a persistent read grant on a picker-returned URI and return an
   * opaque handle to store. On Android the handle equals the URI string;
   * on iOS it's a base64-encoded security-scoped bookmark.
   */
  persistFileAccess(uri: string): Promise<string>;

  /** Drop the persistent grant. Idempotent. */
  releaseFileAccess(handle: string): Promise<void>;

  /**
   * Open a read session against the handle and return a URL string that
   * native modules and players can consume. On iOS this starts a
   * security-scoped resource access; on Android it's a pass-through.
   */
  beginSession(handle: string): Promise<string>;

  /** Close the session. iOS releases the security scope; android is a no-op. */
  endSession(handle: string): Promise<void>;
}

const native = requireNativeModule<FileAccessNativeModule>('FileAccess');

export const FileAccess = native;

/**
 * Helper that wraps a one-shot read against a handle in begin/end. Use
 * for short-lived native operations like thumbnail extraction or audio
 * extraction. Long-lived consumers (like the video player) should
 * manage their own session lifecycle.
 */
export async function withSession<T>(
  handle: string,
  fn: (url: string) => Promise<T>,
): Promise<T> {
  const url = await FileAccess.beginSession(handle);
  try {
    return await fn(url);
  } finally {
    try {
      await FileAccess.endSession(handle);
    } catch {
      // ignore — closing a never-opened session is harmless
    }
  }
}

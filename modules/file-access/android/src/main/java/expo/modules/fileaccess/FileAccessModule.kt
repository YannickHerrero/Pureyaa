package expo.modules.fileaccess

import android.content.Intent
import android.net.Uri
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Cross-platform file-access primitives for files picked via SAF / Files
 * app. Conceptually this is the same surface on both platforms, but the
 * "handle" returned by persist is platform-specific:
 *
 *  - Android: the original content:// URI string. SAF persistent
 *    permissions live in the system permission table; resolving a
 *    handle to a URL is just returning the same string.
 *  - iOS: a base64-encoded security-scoped bookmark blob. Resolving a
 *    handle requires deserializing the bookmark and calling
 *    startAccessingSecurityScopedResource on the resolved URL.
 *
 * The session API (begin/end) exists for symmetry. On Android it's a
 * pass-through; on iOS it manages the security scope lifecycle so
 * native consumers (audio extractor, thumbnailer, video player) can
 * read the file safely regardless of platform.
 */
class FileAccessModule : Module() {
  companion object {
    private const val TAG = "FileAccess"
  }

  override fun definition() = ModuleDefinition {
    Name("FileAccess")

    /**
     * Take a persistent read grant on the URI returned by a DocumentPicker
     * and return the same URI string back as the handle to store. Silently
     * no-ops on URIs that aren't persistable (rare; e.g. ACTION_GET_CONTENT
     * results).
     */
    AsyncFunction("persistFileAccess") { uriString: String ->
      val context = appContext.reactContext ?: error("No Android context available")
      val uri = Uri.parse(uriString)
      try {
        context.contentResolver.takePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
        Log.d(TAG, "persisted URI permission for $uri")
      } catch (e: SecurityException) {
        Log.w(TAG, "could not persist URI permission for $uri: ${e.message}")
      }
      uriString
    }

    /**
     * Drop the persistent grant. Best-effort; throws are swallowed
     * because a missing grant is harmless on cleanup.
     */
    AsyncFunction("releaseFileAccess") { handle: String ->
      val context = appContext.reactContext ?: error("No Android context available")
      val uri = Uri.parse(handle)
      try {
        context.contentResolver.releasePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      } catch (e: SecurityException) {
        Log.w(TAG, "no persisted permission to release for $uri: ${e.message}")
      }
    }

    /**
     * Open a session on the handle and return a URL string the consumer
     * can read. On Android this is a pass-through — the URI is already
     * usable as long as we hold the persistent grant.
     */
    AsyncFunction("beginSession") { handle: String ->
      handle
    }

    /** Close a session. No-op on Android. */
    AsyncFunction("endSession") { _handle: String ->
      // intentional no-op
    }
  }
}

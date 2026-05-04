import ExpoModulesCore
import Foundation

/**
 * iOS implementation of the file-access module.
 *
 * iOS doesn't have SAF persistent permissions like Android. Instead, the
 * Files-app picker hands back a security-scoped URL that's only readable
 * while the app holds an active "scope" on it. To survive across app
 * launches, we encode the URL into a security-scoped bookmark blob (the
 * "handle") and resolve+open the scope on demand via beginSession.
 *
 * Lifecycle in Pureyaa:
 *   1. picker returns URL → persistFileAccess(url) → bookmark blob
 *   2. blob stored in entry.videoUri
 *   3. before any read (player, thumbnail, audio extract): beginSession
 *      resolves the bookmark and starts the scope, returns a file:// URL
 *   4. after the read or when the player unmounts: endSession stops the scope
 *   5. on entry deletion: releaseFileAccess (best-effort cleanup)
 */
public class FileAccessModule: Module {
  // Map: handle (base64 bookmark) -> the URL whose scope is currently open.
  // We keep the URL instance around so endSession can call
  // stopAccessingSecurityScopedResource on the same object that was started.
  private var openedSessions: [String: URL] = [:]
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("FileAccess")

    AsyncFunction("persistFileAccess") { (input: String) -> String in
      // If the input is already a valid bookmark blob (e.g. came back
      // through expo-router's defensive re-persist), no-op and return it.
      if isValidBookmark(input) {
        return input
      }

      // Otherwise treat as a file URL (file:// from the picker, or a
      // bare path) and create a bookmark.
      let url = try parseFileUrl(input)

      let started = url.startAccessingSecurityScopedResource()
      defer { if started { url.stopAccessingSecurityScopedResource() } }

      do {
        let bookmark = try url.bookmarkData(
          options: [],
          includingResourceValuesForKeys: nil,
          relativeTo: nil
        )
        return bookmark.base64EncodedString()
      } catch {
        throw FileAccessError.bookmarkFailed(error.localizedDescription)
      }
    }

    AsyncFunction("releaseFileAccess") { (handle: String) in
      // Bookmarks are self-contained — there's no system table to update.
      // Just close any session we still have open for this handle.
      self.lock.lock()
      let url = self.openedSessions.removeValue(forKey: handle)
      self.lock.unlock()
      url?.stopAccessingSecurityScopedResource()
    }

    AsyncFunction("beginSession") { (handle: String) -> String in
      // Handles to files we own (e.g. subtitle SRTs we wrote to the app
      // sandbox) are plain file URLs, not bookmarks. Pass them through
      // without opening a security scope — there's nothing to scope.
      if handle.hasPrefix("file://") || handle.hasPrefix("/") {
        return handle
      }

      guard let bookmarkData = Data(base64Encoded: handle) else {
        throw FileAccessError.invalidInput("Handle is not valid base64")
      }

      var isStale = false
      let url: URL
      do {
        url = try URL(
          resolvingBookmarkData: bookmarkData,
          options: [],
          relativeTo: nil,
          bookmarkDataIsStale: &isStale
        )
      } catch {
        throw FileAccessError.resolveFailed(error.localizedDescription)
      }

      let started = url.startAccessingSecurityScopedResource()
      if !started {
        throw FileAccessError.scopeStartFailed(
          "Could not start security scope for \(url.path)"
        )
      }

      self.lock.lock()
      // If a previous session was open for this handle (shouldn't happen
      // in normal flow, but be defensive), close it before replacing.
      if let prev = self.openedSessions.removeValue(forKey: handle) {
        prev.stopAccessingSecurityScopedResource()
      }
      self.openedSessions[handle] = url
      self.lock.unlock()

      return url.absoluteString
    }

    AsyncFunction("endSession") { (handle: String) in
      self.lock.lock()
      let url = self.openedSessions.removeValue(forKey: handle)
      self.lock.unlock()
      url?.stopAccessingSecurityScopedResource()
    }
  }

  /// Best-effort detection of whether a string is a security-scoped bookmark
  /// we previously created. Tries to base64-decode and resolve; if either
  /// fails, returns false (meaning: probably a URL string).
  private func isValidBookmark(_ input: String) -> Bool {
    guard let data = Data(base64Encoded: input), !data.isEmpty else { return false }
    var isStale = false
    return (try? URL(
      resolvingBookmarkData: data,
      options: [],
      relativeTo: nil,
      bookmarkDataIsStale: &isStale
    )) != nil
  }

  /// Parse the input as a URL. Accepts `file://` URLs verbatim and falls
  /// back to treating the input as a bare filesystem path.
  private func parseFileUrl(_ input: String) throws -> URL {
    if input.hasPrefix("file://"), let url = URL(string: input) {
      return url
    }
    if input.hasPrefix("/") {
      return URL(fileURLWithPath: input)
    }
    throw FileAccessError.invalidInput(
      "Could not interpret '\(String(input.prefix(80)))' as a file URL or bookmark"
    )
  }
}

private enum FileAccessError: Error, LocalizedError {
  case invalidInput(String)
  case bookmarkFailed(String)
  case resolveFailed(String)
  case scopeStartFailed(String)

  var errorDescription: String? {
    switch self {
    case .invalidInput(let m), .bookmarkFailed(let m),
         .resolveFailed(let m), .scopeStartFailed(let m):
      return m
    }
  }
}

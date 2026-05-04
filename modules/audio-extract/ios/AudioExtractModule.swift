import ExpoModulesCore
import AVFoundation
import Foundation

/**
 * iOS implementation of audio-extract. Mirrors the Kotlin module's API
 * but uses AVAssetExportSession with the AppleM4A preset, which always
 * produces AAC inside an MP4 container (.m4a) regardless of the input
 * codec. This is simpler than the Kotlin pipeline (which fast-paths
 * codec-compatible remuxes) at the cost of always re-encoding —
 * acceptable since downstream consumers (Whisper transcription, Anki
 * audio cards) only care about the bytes being readable.
 *
 * Output extension is forced to .m4a even if `outPath` requested
 * something else; the JS caller already inspects the returned path
 * to learn the actual extension.
 */
public class AudioExtractModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioExtract")

    AsyncFunction("extractAudio") { (
      srcUri: String,
      startMs: Int,
      endMs: Int,
      outPath: String
    ) -> String in
      let srcUrl = try parseFileUrl(srcUri)
      let outUrl = try prepareOutputUrl(outPath)

      let asset = AVURLAsset(url: srcUrl, options: [
        AVURLAssetPreferPreciseDurationAndTimingKey: true,
      ])

      // Sanity: there must be at least one audio track.
      let audioTracks = asset.tracks(withMediaType: .audio)
      guard !audioTracks.isEmpty else {
        throw AudioExtractError.noAudioTrack(srcUrl.path)
      }

      guard let exporter = AVAssetExportSession(
        asset: asset,
        presetName: AVAssetExportPresetAppleM4A
      ) else {
        throw AudioExtractError.exportSetup(
          "Could not create AVAssetExportSession for \(srcUrl.path)"
        )
      }

      exporter.outputURL = outUrl
      exporter.outputFileType = .m4a
      exporter.timeRange = computeTimeRange(asset: asset, startMs: startMs, endMs: endMs)

      // Bridge AVAssetExportSession's callback into async/await so the
      // ExpoModule AsyncFunction promise resolves when the export is done.
      try await runExport(exporter)

      return "file://" + outUrl.path
    }
  }
}

// MARK: - Helpers

private func parseFileUrl(_ input: String) throws -> URL {
  if input.hasPrefix("file://"), let url = URL(string: input) {
    return url
  }
  if input.hasPrefix("/") {
    return URL(fileURLWithPath: input)
  }
  throw AudioExtractError.invalidSource(input)
}

private func prepareOutputUrl(_ outPath: String) throws -> URL {
  // Strip file:// scheme if present.
  let raw = outPath.hasPrefix("file://")
    ? String(outPath.dropFirst("file://".count))
    : outPath

  // Force .m4a extension regardless of what was requested.
  let withoutExt = (raw as NSString).deletingPathExtension
  let final = withoutExt + ".m4a"
  let url = URL(fileURLWithPath: final)

  // Ensure parent directory exists.
  let parent = url.deletingLastPathComponent()
  try FileManager.default.createDirectory(
    at: parent,
    withIntermediateDirectories: true
  )

  // AVAssetExportSession refuses to overwrite an existing file.
  if FileManager.default.fileExists(atPath: url.path) {
    try FileManager.default.removeItem(at: url)
  }

  return url
}

private func computeTimeRange(asset: AVAsset, startMs: Int, endMs: Int) -> CMTimeRange {
  let durationMs = Int(CMTimeGetSeconds(asset.duration) * 1000.0)
  let clampedStart = max(0, startMs)
  let clampedEnd = min(max(clampedStart, endMs), durationMs > 0 ? durationMs : endMs)
  let rangeMs = max(0, clampedEnd - clampedStart)
  let timescale: CMTimeScale = 1000
  return CMTimeRange(
    start: CMTime(value: CMTimeValue(clampedStart), timescale: timescale),
    duration: CMTime(value: CMTimeValue(rangeMs), timescale: timescale)
  )
}

@available(iOS 13.0, *)
private func runExport(_ exporter: AVAssetExportSession) async throws {
  try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
    exporter.exportAsynchronously {
      switch exporter.status {
      case .completed:
        cont.resume()
      case .failed:
        cont.resume(
          throwing: exporter.error
            ?? AudioExtractError.exportFailed("export failed without specific error")
        )
      case .cancelled:
        cont.resume(throwing: AudioExtractError.exportFailed("export cancelled"))
      default:
        cont.resume(
          throwing: AudioExtractError.exportFailed(
            "export ended with status \(exporter.status.rawValue)"
          )
        )
      }
    }
  }
}

// MARK: - Errors

private enum AudioExtractError: Error, LocalizedError {
  case invalidSource(String)
  case noAudioTrack(String)
  case exportSetup(String)
  case exportFailed(String)

  var errorDescription: String? {
    switch self {
    case .invalidSource(let s):
      return "Invalid source URL: \(s)"
    case .noAudioTrack(let path):
      return "No audio track found in \(path)"
    case .exportSetup(let s), .exportFailed(let s):
      return s
    }
  }
}

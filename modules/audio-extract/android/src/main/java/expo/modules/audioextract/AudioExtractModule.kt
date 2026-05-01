package expo.modules.audioextract

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

/**
 * Extracts a time range of the audio track from a video file and writes it
 * as MP4-container audio (.m4a) without transcoding.
 *
 * The output uses MUXER_OUTPUT_MPEG_4 because MediaMuxer cannot write mp3.
 * AnkiDroid plays m4a natively in [sound:...] tags.
 *
 * Note on timing: MediaExtractor.seekTo(start, SEEK_TO_PREVIOUS_SYNC) lands
 * on the previous AAC sync sample, so the clip can start up to ~1s before
 * the requested startMs. For sentence mining this is desirable lead-in.
 */
class AudioExtractModule : Module() {
  companion object {
    private const val TAG = "AudioExtract"
  }

  override fun definition() = ModuleDefinition {
    Name("AudioExtract")

    AsyncFunction("extractAudio") { srcUri: String, startMs: Int, endMs: Int, outPath: String ->
      Log.d(TAG, "extractAudio start: srcUri=$srcUri startMs=$startMs endMs=$endMs outPath=$outPath")
      val context = appContext.reactContext ?: error("No Android context available")

      val extractor = MediaExtractor()
      val uri = Uri.parse(srcUri)
      try {
        Log.d(TAG, "trying setDataSource(context, uri, null) for $uri")
        extractor.setDataSource(context, uri, null)
        Log.d(TAG, "setDataSource via context OK")
      } catch (e: Exception) {
        Log.w(TAG, "setDataSource(context, uri) failed: ${e.javaClass.simpleName}: ${e.message}; trying file path")
        try {
          extractor.setDataSource(srcUri.removePrefix("file://"))
          Log.d(TAG, "setDataSource via file path OK")
        } catch (e2: Exception) {
          Log.e(TAG, "setDataSource fallback also failed", e2)
          extractor.release()
          throw IllegalStateException(
            "Could not open source ($srcUri): ${e2.javaClass.simpleName}: ${e2.message}",
          )
        }
      }

      Log.d(TAG, "trackCount=${extractor.trackCount}")
      var trackIndex = -1
      var audioFormat: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        Log.d(TAG, "  track $i mime=$mime")
        if (mime.startsWith("audio/")) {
          trackIndex = i
          audioFormat = format
          break
        }
      }
      if (trackIndex < 0 || audioFormat == null) {
        extractor.release()
        throw IllegalStateException("No audio track found in source $srcUri")
      }
      val mime = audioFormat.getString(MediaFormat.KEY_MIME) ?: ""
      Log.d(TAG, "selected audio track $trackIndex ($mime)")
      extractor.selectTrack(trackIndex)
      extractor.seekTo(startMs * 1000L, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

      // MediaMuxer for MP4 supports AAC; for OGG container it supports Opus
      // (API 29+) and Vorbis (API 21+, but rare). Pick the right container
      // for this codec and rename the output file's extension to match.
      val outputFormat: Int
      val ext: String
      when {
        mime.equals("audio/mp4a-latm", true) || mime.equals("audio/aac", true) -> {
          outputFormat = MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
          ext = "m4a"
        }
        mime.equals("audio/opus", true) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
          outputFormat = MediaMuxer.OutputFormat.MUXER_OUTPUT_OGG
          ext = "ogg"
        }
        mime.equals("audio/vorbis", true) -> {
          outputFormat = MediaMuxer.OutputFormat.MUXER_OUTPUT_OGG
          ext = "ogg"
        }
        else -> {
          extractor.release()
          throw IllegalStateException(
            "Audio codec '$mime' can't be extracted without transcoding. " +
              "Try a video with AAC or Opus audio.",
          )
        }
      }

      // Replace the extension on the requested output path with our chosen one.
      val rawPath = outPath.removePrefix("file://")
      val basePath = rawPath.replace(Regex("\\.[A-Za-z0-9]+$"), "")
      val outFile = File("$basePath.$ext")
      outFile.parentFile?.mkdirs()
      Log.d(TAG, "writing to ${outFile.absolutePath} (container=$outputFormat)")
      val muxer = MediaMuxer(outFile.absolutePath, outputFormat)
      val muxerTrack = muxer.addTrack(audioFormat)
      muxer.start()

      val buffer = ByteBuffer.allocate(256 * 1024)
      val info = MediaCodec.BufferInfo()
      val endUs = endMs * 1000L
      var sampleCount = 0

      try {
        while (true) {
          val size = extractor.readSampleData(buffer, 0)
          if (size < 0) break
          val sampleTimeUs = extractor.sampleTime
          if (sampleTimeUs > endUs) break
          info.offset = 0
          info.size = size
          info.presentationTimeUs = sampleTimeUs
          info.flags = extractor.sampleFlags
          muxer.writeSampleData(muxerTrack, buffer, info)
          extractor.advance()
          sampleCount++
        }
      } catch (e: Exception) {
        Log.e(TAG, "while writing samples", e)
        throw e
      } finally {
        try {
          muxer.stop()
        } catch (e: Exception) {
          Log.w(TAG, "muxer.stop() threw: ${e.message}")
        }
        muxer.release()
        extractor.release()
      }

      Log.d(TAG, "extractAudio done: $sampleCount samples written to ${outFile.absolutePath}")
      return@AsyncFunction outFile.absolutePath
    }
  }
}

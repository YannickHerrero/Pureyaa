package expo.modules.audioextract

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
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
  override fun definition() = ModuleDefinition {
    Name("AudioExtract")

    AsyncFunction("extractAudio") { srcUri: String, startMs: Int, endMs: Int, outPath: String ->
      val context = appContext.reactContext ?: error("No Android context available")

      val extractor = MediaExtractor()
      val uri = Uri.parse(srcUri)
      try {
        extractor.setDataSource(context, uri, null)
      } catch (_: Exception) {
        extractor.setDataSource(srcUri.removePrefix("file://"))
      }

      var trackIndex = -1
      var audioFormat: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("audio/")) {
          trackIndex = i
          audioFormat = format
          break
        }
      }
      if (trackIndex < 0 || audioFormat == null) {
        extractor.release()
        error("No audio track found in source")
      }
      extractor.selectTrack(trackIndex)
      extractor.seekTo(startMs * 1000L, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

      val outFile = File(outPath.removePrefix("file://"))
      outFile.parentFile?.mkdirs()
      val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val muxerTrack = muxer.addTrack(audioFormat)
      muxer.start()

      val buffer = ByteBuffer.allocate(256 * 1024)
      val info = MediaCodec.BufferInfo()
      val endUs = endMs * 1000L

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
        }
      } finally {
        try {
          muxer.stop()
        } catch (_: Exception) {
        }
        muxer.release()
        extractor.release()
      }

      return@AsyncFunction outFile.absolutePath
    }
  }
}

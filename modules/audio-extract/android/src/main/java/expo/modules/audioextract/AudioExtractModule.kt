package expo.modules.audioextract

import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
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
 * to disk for use as a flashcard's audio field.
 *
 * Two paths:
 *   1. Stream-copy / remux for MediaMuxer-compatible codecs:
 *        - AAC → .m4a (MUXER_OUTPUT_MPEG_4)
 *        - Opus → .ogg (MUXER_OUTPUT_OGG, API 29+)
 *        - Vorbis → .ogg
 *      Fast: no decoding/encoding, no quality loss.
 *
 *   2. Transcode to AAC for everything else (E-AC3, AC3, DTS, FLAC, MP3, ...):
 *        decoder → PCM → AAC encoder → MUXER_OUTPUT_MPEG_4 → .m4a
 *      Slower (~real-time) but works for any codec MediaCodec can decode.
 */
class AudioExtractModule : Module() {
  companion object {
    private const val TAG = "AudioExtract"
    private const val TRANSCODE_BITRATE = 128_000
    private const val TIMEOUT_US = 10_000L
  }

  override fun definition() = ModuleDefinition {
    Name("AudioExtract")

    AsyncFunction("extractAudio") { srcUri: String, startMs: Int, endMs: Int, outPath: String ->
      Log.d(TAG, "extractAudio start: srcUri=$srcUri startMs=$startMs endMs=$endMs outPath=$outPath")
      val context = appContext.reactContext ?: error("No Android context available")
      runExtract(context, srcUri, startMs, endMs, outPath)
    }
  }

  private fun runExtract(
    context: Context,
    srcUri: String,
    startMs: Int,
    endMs: Int,
    outPath: String,
  ): String {
    val extractor = openExtractor(context, srcUri)
    val (trackIndex, audioFormat) = findAudioTrack(extractor)
      ?: run {
        extractor.release()
        throw IllegalStateException("No audio track found in source $srcUri")
      }
    val mime = audioFormat.getString(MediaFormat.KEY_MIME) ?: ""
    Log.d(TAG, "selected audio track $trackIndex ($mime)")
    extractor.selectTrack(trackIndex)
    extractor.seekTo(startMs * 1000L, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

    val basePath = outPath.removePrefix("file://").replace(Regex("\\.[A-Za-z0-9]+$"), "")
    val endUs = endMs * 1000L

    return try {
      when {
        mime.equals("audio/mp4a-latm", true) || mime.equals("audio/aac", true) ->
          remux(extractor, audioFormat, "$basePath.m4a", endUs, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        mime.equals("audio/opus", true) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
          remux(extractor, audioFormat, "$basePath.ogg", endUs, MediaMuxer.OutputFormat.MUXER_OUTPUT_OGG)
        mime.equals("audio/vorbis", true) ->
          remux(extractor, audioFormat, "$basePath.ogg", endUs, MediaMuxer.OutputFormat.MUXER_OUTPUT_OGG)
        else ->
          transcodeToAac(extractor, audioFormat, "$basePath.m4a", endUs)
      }
    } finally {
      extractor.release()
    }
  }

  private fun openExtractor(context: Context, srcUri: String): MediaExtractor {
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
        throw IllegalStateException("Could not open source ($srcUri): ${e2.javaClass.simpleName}: ${e2.message}")
      }
    }
    return extractor
  }

  private fun findAudioTrack(extractor: MediaExtractor): Pair<Int, MediaFormat>? {
    Log.d(TAG, "trackCount=${extractor.trackCount}")
    for (i in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(i)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
      Log.d(TAG, "  track $i mime=$mime")
      if (mime.startsWith("audio/")) return i to format
    }
    return null
  }

  /** Stream-copy: write input samples directly to the output container. */
  private fun remux(
    extractor: MediaExtractor,
    audioFormat: MediaFormat,
    outAbsolutePath: String,
    endUs: Long,
    outputFormat: Int,
  ): String {
    val outFile = File(outAbsolutePath)
    outFile.parentFile?.mkdirs()
    Log.d(TAG, "remux → $outAbsolutePath (container=$outputFormat)")
    val muxer = MediaMuxer(outFile.absolutePath, outputFormat)
    val muxerTrack = muxer.addTrack(audioFormat)
    muxer.start()

    val buffer = ByteBuffer.allocate(256 * 1024)
    val info = MediaCodec.BufferInfo()
    var written = 0
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
        written++
      }
    } finally {
      try {
        muxer.stop()
      } catch (e: Exception) {
        Log.w(TAG, "muxer.stop() threw: ${e.message}")
      }
      muxer.release()
    }
    Log.d(TAG, "remux done: $written samples → $outAbsolutePath")
    return "file://$outAbsolutePath"
  }

  /**
   * Decode the input audio with MediaCodec and re-encode as AAC, then mux into MP4.
   * Used for codecs MediaMuxer can't write directly (E-AC3, AC3, DTS, FLAC, MP3, ...).
   *
   * Pipeline order on every iteration:
   *   1. Drain encoder → muxer (must run first to keep encoder input slots free)
   *   2. Move decoder output → encoder input
   *   3. Feed extractor → decoder input
   *
   * Doing (1) before (2) is critical — if we try to feed the encoder before
   * draining it, the encoder fills its output buffers, then refuses input,
   * which blocks the decoder, which deadlocks the whole pipeline.
   */
  private fun transcodeToAac(
    extractor: MediaExtractor,
    audioFormat: MediaFormat,
    outAbsolutePath: String,
    endUs: Long,
  ): String {
    val inputMime = audioFormat.getString(MediaFormat.KEY_MIME)!!
    val sampleRate = audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    val channelCount = audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    Log.d(TAG, "transcodeToAac($inputMime, ${sampleRate}Hz, ${channelCount}ch) → $outAbsolutePath")

    // AAC LC tops out at 6 channels. 7.1+ (8-channel) sources need to be
    // downmixed before they can be encoded — we don't do that yet, so fail
    // with a clear message instead of a generic encoder.configure throw.
    if (channelCount > 6) {
      throw IllegalStateException(
        "Audio has $channelCount channels; AAC LC supports at most 6. " +
          "Re-encode the source to stereo or 5.1 first.",
      )
    }

    val decoder = MediaCodec.createDecoderByType(inputMime).apply {
      configure(audioFormat, null, null, 0)
      start()
    }

    val encoderFormat = MediaFormat.createAudioFormat(
      MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channelCount,
    ).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, TRANSCODE_BITRATE)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 64 * 1024)
    }
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
      configure(encoderFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      start()
    }

    val outFile = File(outAbsolutePath)
    outFile.parentFile?.mkdirs()
    val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxerTrack = -1
    var muxerStarted = false

    var extractorEos = false
    var decoderEos = false
    var encoderEos = false
    val info = MediaCodec.BufferInfo()
    var samplesWritten = 0
    val startedAt = System.currentTimeMillis()

    try {
      outerLoop@ while (!encoderEos) {
        // Safety bail-out — for a sane clip (<30s), the whole transcode should
        // be in the order of seconds. If we're past 2 minutes the pipeline is
        // wedged; abort with a useful error rather than hang forever.
        if (System.currentTimeMillis() - startedAt > 120_000L) {
          throw IllegalStateException("Audio transcode timed out — pipeline is stuck.")
        }

        // 1. Drain encoder output → muxer (always first, non-blocking)
        while (true) {
          val encIdx = encoder.dequeueOutputBuffer(info, 0)
          if (encIdx == MediaCodec.INFO_TRY_AGAIN_LATER) break
          if (encIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            // Some encoders emit this twice — guard so we don't double-add
            // the track or restart an already-running muxer.
            if (!muxerStarted) {
              muxerTrack = muxer.addTrack(encoder.outputFormat)
              muxer.start()
              muxerStarted = true
              Log.d(TAG, "encoder output format ready, muxer started")
            }
            continue
          }
          if (encIdx < 0) continue
          val outBuf = encoder.getOutputBuffer(encIdx)!!
          if ((info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0 &&
            info.size > 0 &&
            muxerStarted
          ) {
            muxer.writeSampleData(muxerTrack, outBuf, info)
            samplesWritten++
          }
          encoder.releaseOutputBuffer(encIdx, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
            encoderEos = true
            break@outerLoop
          }
        }

        // 2. Move decoder output → encoder input (non-blocking dequeue;
        //    short-blocking encoder input dequeue so a momentarily-full
        //    encoder doesn't drop samples). Always release decoder output
        //    so the decoder doesn't run out of buffers.
        if (!decoderEos) {
          val decIdx = decoder.dequeueOutputBuffer(info, 0)
          if (decIdx >= 0) {
            val isDecEos = (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0
            val pcm = decoder.getOutputBuffer(decIdx)!!
            val encInIdx = encoder.dequeueInputBuffer(50_000L)
            if (encInIdx >= 0) {
              val encIn = encoder.getInputBuffer(encInIdx)!!
              encIn.clear()
              if (info.size > 0) {
                pcm.position(info.offset)
                pcm.limit(info.offset + info.size)
                encIn.put(pcm)
              }
              encoder.queueInputBuffer(
                encInIdx,
                0,
                info.size,
                info.presentationTimeUs,
                if (isDecEos) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0,
              )
              if (isDecEos) decoderEos = true
            } else {
              Log.w(TAG, "encoder input slot timed out — dropping decoded sample at ${info.presentationTimeUs}us")
            }
            decoder.releaseOutputBuffer(decIdx, false)
          }
        }

        // 3. Feed extractor → decoder input (non-blocking)
        if (!extractorEos) {
          val decInIdx = decoder.dequeueInputBuffer(0)
          if (decInIdx >= 0) {
            val buf = decoder.getInputBuffer(decInIdx)!!
            buf.clear()
            val size = extractor.readSampleData(buf, 0)
            val pts = extractor.sampleTime
            if (size < 0 || (pts > endUs && pts != -1L)) {
              decoder.queueInputBuffer(decInIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              extractorEos = true
            } else {
              decoder.queueInputBuffer(decInIdx, 0, size, pts, 0)
              extractor.advance()
            }
          }
        }
      }
    } finally {
      try {
        decoder.stop(); decoder.release()
      } catch (_: Exception) {
      }
      try {
        encoder.stop(); encoder.release()
      } catch (_: Exception) {
      }
      try {
        if (muxerStarted) muxer.stop()
      } catch (e: Exception) {
        Log.w(TAG, "muxer.stop() threw: ${e.message}")
      }
      muxer.release()
    }

    Log.d(TAG, "transcodeToAac done: $samplesWritten AAC frames → $outAbsolutePath")
    return "file://$outAbsolutePath"
  }
}

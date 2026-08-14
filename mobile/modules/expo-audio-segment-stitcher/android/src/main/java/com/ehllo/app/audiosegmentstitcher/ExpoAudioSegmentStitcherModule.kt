package com.ehllo.app.audiosegmentstitcher

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import java.io.File
import java.nio.ByteBuffer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoAudioSegmentStitcherModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoAudioSegmentStitcher")

    // Combines recording segments (each its own finalized .m4a — expo-audio
    // can't reopen and append to an already-stopped file, e.g. after the
    // interruption watchdog forces a new take) into one continuous .m4a via
    // MediaExtractor/MediaMuxer, so playback/upload always sees a single file.
    AsyncFunction("concatenateSegments") { uris: List<String> ->
      concatenate(uris)
    }
  }

  private fun resolvePath(uriString: String): String {
    val uri = Uri.parse(uriString)
    return uri.path?.takeIf { uri.scheme == "file" } ?: uriString
  }

  private fun concatenate(uris: List<String>): String {
    if (uris.isEmpty()) throw Exception("No audio segments were provided.")
    if (uris.size == 1) return uris[0]

    val outputFile = File.createTempFile("ehllo-stitched-", ".m4a")
    val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

    var audioTrackIndex = -1
    var muxerStarted = false
    var timeOffsetUs = 0L
    val bufferInfo = MediaCodec.BufferInfo()
    val buffer = ByteBuffer.allocate(1 * 1024 * 1024)

    try {
      for (uriString in uris) {
        val path = resolvePath(uriString)
        val extractor = MediaExtractor()
        extractor.setDataSource(path)

        var trackIndex = -1
        var format: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
          val candidate = extractor.getTrackFormat(i)
          val mime = candidate.getString(MediaFormat.KEY_MIME) ?: ""
          if (mime.startsWith("audio/")) {
            trackIndex = i
            format = candidate
            break
          }
        }
        if (trackIndex == -1 || format == null) {
          extractor.release()
          throw Exception("Segment has no audio track: $uriString")
        }
        extractor.selectTrack(trackIndex)

        if (!muxerStarted) {
          audioTrackIndex = muxer.addTrack(format)
          muxer.start()
          muxerStarted = true
        }

        var maxPresentationTimeUs = 0L
        while (true) {
          buffer.clear()
          val sampleSize = extractor.readSampleData(buffer, 0)
          if (sampleSize < 0) break
          val presentationTimeUs = extractor.sampleTime
          bufferInfo.offset = 0
          bufferInfo.size = sampleSize
          bufferInfo.presentationTimeUs = presentationTimeUs + timeOffsetUs
          bufferInfo.flags = extractor.sampleFlags
          muxer.writeSampleData(audioTrackIndex, buffer, bufferInfo)
          if (presentationTimeUs > maxPresentationTimeUs) maxPresentationTimeUs = presentationTimeUs
          extractor.advance()
        }
        timeOffsetUs += maxPresentationTimeUs
        extractor.release()
      }
    } finally {
      try {
        muxer.stop()
      } catch (_: Exception) {
        // Nothing more we can do if the muxer never got a valid track/samples.
      }
      muxer.release()
    }

    return Uri.fromFile(outputFile).toString()
  }
}

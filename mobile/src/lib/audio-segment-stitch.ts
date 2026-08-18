import ExpoAudioSegmentStitcher from '../../modules/expo-audio-segment-stitcher';

/**
 * Combines recording segments (see use-capture-recorder.ts's continueRecording)
 * into a single .m4a file via native audio composition, so upload/playback
 * code downstream never needs to know a recording was ever split across
 * multiple takes. `segments` should be in chronological order, oldest first,
 * ending with the current/latest take.
 *
 * Falls back to the latest segment (rather than throwing) if stitching
 * fails - losing the earlier audio is preferable to losing the whole save,
 * especially since the full transcript already covers every segment
 * regardless of what happens to the audio file.
 */
export async function stitchRecordingSegments(segments: string[], latestUri: string): Promise<string> {
  const all = [...segments, latestUri].filter((uri) => uri.trim());
  if (all.length <= 1) return latestUri;

  try {
    return await ExpoAudioSegmentStitcher.concatenateSegments(all);
  } catch {
    return latestUri;
  }
}

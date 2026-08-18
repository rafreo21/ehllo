import { registerWebModule, NativeModule } from 'expo';

// True lossless concatenation needs native muxing, which isn't available on
// web - this degrades to "keep the latest segment" rather than throwing, so
// a save can still complete (with only the most recent take's audio) instead
// of hard-failing on a platform this recorder isn't primarily built for.
class ExpoAudioSegmentStitcherModule extends NativeModule<{}> {
  async concatenateSegments(uris: string[]): Promise<string> {
    const last = uris[uris.length - 1];
    if (!last) throw new Error('No audio segments were provided.');
    return last;
  }
}

export default registerWebModule(ExpoAudioSegmentStitcherModule, 'ExpoAudioSegmentStitcherModule');

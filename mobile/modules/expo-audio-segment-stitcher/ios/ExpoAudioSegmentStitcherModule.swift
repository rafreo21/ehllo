import ExpoModulesCore
import AVFoundation

enum AudioSegmentStitchError: Error, LocalizedError {
  case noSegments
  case trackCreationFailed
  case invalidUri(String)
  case noAudioTrack(String)
  case exportSessionFailed
  case exportFailed(String)

  var errorDescription: String? {
    switch self {
    case .noSegments:
      return "No audio segments were provided."
    case .trackCreationFailed:
      return "Could not create a composition track for stitching."
    case .invalidUri(let uri):
      return "Invalid audio segment URI: \(uri)"
    case .noAudioTrack(let uri):
      return "Segment has no audio track: \(uri)"
    case .exportSessionFailed:
      return "Could not create an export session for the stitched recording."
    case .exportFailed(let message):
      return "Export failed: \(message)"
    }
  }
}

public class ExpoAudioSegmentStitcherModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoAudioSegmentStitcher")

    // Combines recording segments (each its own finalized .m4a - expo-audio
    // can't reopen and append to an already-stopped file, e.g. after the
    // interruption watchdog forces a new take) into one continuous .m4a via
    // AVFoundation composition, so playback/upload always sees a single file.
    AsyncFunction("concatenateSegments") { (uris: [String]) -> String in
      try self.concatenate(uris: uris)
    }
  }

  private func concatenate(uris: [String]) throws -> String {
    guard !uris.isEmpty else { throw AudioSegmentStitchError.noSegments }
    guard uris.count > 1 else { return uris[0] }

    let composition = AVMutableComposition()
    guard let audioTrack = composition.addMutableTrack(
      withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw AudioSegmentStitchError.trackCreationFailed
    }

    var insertTime = CMTime.zero
    for uriString in uris {
      guard let url = fileURL(from: uriString) else {
        throw AudioSegmentStitchError.invalidUri(uriString)
      }
      let asset = AVURLAsset(url: url)
      guard let sourceTrack = asset.tracks(withMediaType: .audio).first else {
        throw AudioSegmentStitchError.noAudioTrack(uriString)
      }
      let range = CMTimeRange(start: .zero, duration: asset.duration)
      try audioTrack.insertTimeRange(range, of: sourceTrack, at: insertTime)
      insertTime = CMTimeAdd(insertTime, asset.duration)
    }

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("aftermeet-stitched-\(UUID().uuidString).m4a")

    guard let exportSession = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetAppleM4A
    ) else {
      throw AudioSegmentStitchError.exportSessionFailed
    }
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .m4a

    let semaphore = DispatchSemaphore(value: 0)
    var exportError: Error?
    exportSession.exportAsynchronously {
      if exportSession.status != .completed {
        exportError = exportSession.error ?? AudioSegmentStitchError.exportFailed("unknown")
      }
      semaphore.signal()
    }
    semaphore.wait()

    if let exportError {
      throw AudioSegmentStitchError.exportFailed(exportError.localizedDescription)
    }

    return outputURL.absoluteString
  }

  private func fileURL(from uriString: String) -> URL? {
    if let url = URL(string: uriString), url.scheme != nil {
      return url
    }
    return URL(fileURLWithPath: uriString)
  }
}

import { NextResponse } from "next/server";

import {
  hasActiveCloudRecording,
  normalizeIncomingRecording,
} from "../../../../../../lib/recording-metadata";
import { ENCOUNTER_RECORDINGS_BUCKET, createServiceSupabaseClient } from "../../../../../../lib/supabase/service";
import { audioFileExtension, detectAudioMimeType } from "../../../../../../lib/audio-format";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "A share token is required." }, { status: 400 });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Shared recording playback is not configured yet." }, { status: 503 });
  }

  const { data: encounter, error } = await service
    .from("encounters")
    .select("recording_metadata, status")
    .eq("share_token", token.trim())
    .eq("status", "shared")
    .maybeSingle();

  if (error || !encounter) {
    return NextResponse.json({ error: "This meeting record is not available." }, { status: 404 });
  }

  const recording = normalizeIncomingRecording(
    encounter.recording_metadata && typeof encounter.recording_metadata === "object"
      ? encounter.recording_metadata as Record<string, unknown>
      : null,
  );

  if (!hasActiveCloudRecording(recording)) {
    return NextResponse.json({ error: "This shared recording is no longer available." }, { status: 404 });
  }

  const storagePath = recording?.storagePath?.trim() ?? "";
  const download = await service.storage.from(ENCOUNTER_RECORDINGS_BUCKET).download(storagePath);
  if (download.error || !download.data) {
    return NextResponse.json({ error: "Could not load this recording." }, { status: 404 });
  }

  const buffer = Buffer.from(await download.data.arrayBuffer());
  // Trust the file signature over historical metadata. Some iOS recordings
  // were uploaded as audio/mpeg even though the bytes are an MP4/M4A file.
  const mimeType = detectAudioMimeType(buffer, recording?.mimeType || download.data.type);
  const totalLength = buffer.byteLength;
  const extension = audioFileExtension(mimeType);
  const filename = `ehllo-recording.${extension}`;

  // <audio> elements issue Range requests (Safari probes with `bytes=0-1`
  // before playback); without a 206 response here they surface a MediaError
  // even though the file itself is fine on a plain full-GET download.
  const rangeHeader = request.headers.get("range");
  const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader) : null;
  if (rangeMatch) {
    const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalLength - 1;
    if (start > end || end >= totalLength) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${totalLength}` },
      });
    }
    const chunk = buffer.subarray(start, end + 1);
    return new NextResponse(chunk, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Range": `bytes ${start}-${end}/${totalLength}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunk.byteLength),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(totalLength),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

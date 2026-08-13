import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../../lib/auth/api-request";
import { connectedAccountStatus, getConnectedAccountAccessToken } from "../../../../../../lib/integrations/connected-accounts";
import { GoogleDriveError, uploadRecordingToGoogleDrive } from "../../../../../../lib/integrations/google-drive";

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ error: "Connect a real Google account to test Drive storage." }, { status: 409 });
  }

  const form = await request.formData();
  const encounterId = String(form.get("encounterId") ?? "").trim();
  const audio = form.get("audio");
  if (!encounterId || !(audio instanceof File) || !audio.size) {
    return NextResponse.json({ error: "An encounter and audio recording are required." }, { status: 400 });
  }

  const status = await connectedAccountStatus(user);
  if (!status.google.connected || !status.google.capabilities.drive) {
    return NextResponse.json({ error: "Reconnect Google to enable Drive storage.", code: "reconnect" }, { status: 403 });
  }
  const accessToken = await getConnectedAccountAccessToken(user, "google");
  if (!accessToken) return NextResponse.json({ error: "Your Google connection expired. Reconnect Google and try again.", code: "reconnect" }, { status: 401 });

  const supabase = await createApiSupabaseClient(request);
  const { data: encounter } = await supabase
    .from("encounters")
    .select("id,title,recording_metadata")
    .eq("id", encounterId)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();
  if (!encounter) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });

  try {
    const driveFile = await uploadRecordingToGoogleDrive({ accessToken, audio, encounterId, title: encounter.title });
    const previous = encounter.recording_metadata && typeof encounter.recording_metadata === "object"
      ? encounter.recording_metadata as Record<string, unknown>
      : {};
    const recording = {
      ...previous,
      fileSize: audio.size,
      mimeType: audio.type || previous.mimeType || "audio/webm",
      audioLocation: "google_drive",
      driveFileId: driveFile.id,
      driveWebViewUrl: driveFile.webViewLink || `https://drive.google.com/open?id=${driveFile.id}`,
      cloudExpiresAt: null,
      retention: "never",
    };
    const { error } = await supabase.from("encounters").update({ recording_metadata: recording }).eq("id", encounterId).eq("workspace_id", user.workspaceId);
    if (error) return NextResponse.json({ error: "Saved to Drive, but Ehllo could not update the encounter." }, { status: 500 });
    return NextResponse.json({ ok: true, recording });
  } catch (error) {
    if (error instanceof GoogleDriveError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "reconnect" ? 401 : 502 });
    }
    return NextResponse.json({ error: "The recording could not be saved to Google Drive. Your local copy is still safe." }, { status: 502 });
  }
}

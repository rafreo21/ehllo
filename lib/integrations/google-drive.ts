import "server-only";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export class GoogleDriveError extends Error {
  constructor(message: string, public readonly code: "reconnect" | "quota" | "permission" | "upload") {
    super(message);
  }
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  if (response.status === 401) throw new GoogleDriveError("Your Google connection expired. Reconnect Google and try again.", "reconnect");
  if (body.includes("storageQuotaExceeded") || body.includes("quotaExceeded")) {
    throw new GoogleDriveError("Your Google Drive is full. Free some space, then try again.", "quota");
  }
  if (response.status === 403) throw new GoogleDriveError("Google Drive access is missing. Reconnect Google to approve Drive.", "permission");
  throw new GoogleDriveError("The recording could not be saved to Google Drive. Your local copy is still safe.", "upload");
}

async function ensureAfterMeetFolder(accessToken: string) {
  const query = "name = 'ehllo' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const search = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)&pageSize=1`, accessToken);
  const result = await search.json() as { files?: Array<{ id: string }> };
  if (result.files?.[0]?.id) return result.files[0].id;

  const create = await driveFetch(`${DRIVE_API}/files?fields=id`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "ehllo", mimeType: "application/vnd.google-apps.folder" }),
  });
  const folder = await create.json() as { id: string };
  return folder.id;
}

export async function uploadRecordingToGoogleDrive(input: {
  accessToken: string;
  audio: File;
  encounterId: string;
  title: string;
}) {
  const folderId = await ensureAfterMeetFolder(input.accessToken);
  const boundary = `aftermeet-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: `${input.title || "ehllo recording"} - ${new Date().toISOString().slice(0, 10)}.${input.audio.name.split(".").pop() || "webm"}`,
    parents: [folderId],
    appProperties: { aftermeetEncounterId: input.encounterId },
  });
  const bytes = new Uint8Array(await input.audio.arrayBuffer());
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${input.audio.type || "application/octet-stream"}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(bytes, prefix.length);
  body.set(suffix, prefix.length + bytes.length);

  const response = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, input.accessToken, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return response.json() as Promise<{ id: string; name: string; webViewLink?: string }>;
}

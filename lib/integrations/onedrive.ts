import "server-only";

const GRAPH_API = "https://graph.microsoft.com/v1.0";
const CHUNK_SIZE = 5 * 1024 * 1024;

export class OneDriveError extends Error {
  constructor(message: string, public readonly code: "reconnect" | "quota" | "permission" | "upload") {
    super(message);
  }
}

async function graphFetch(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  if (response.status === 401) throw new OneDriveError("Your Microsoft connection expired. Reconnect Microsoft and try again.", "reconnect");
  if (response.status === 507 || /quota|storageLimitExceeded/i.test(body)) {
    throw new OneDriveError("Your OneDrive is full. Free some space, then try again.", "quota");
  }
  if (response.status === 403) throw new OneDriveError("OneDrive access is missing. Reconnect Microsoft to approve recording storage.", "permission");
  throw new OneDriveError("The recording could not be saved to OneDrive. Your local copy is still safe.", "upload");
}

function safeFileName(title: string, originalName: string) {
  const extension = originalName.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "webm";
  const base = (title || "Ehllo recording")
    .replace(/[\x00-\x1f<>:"/\\|?*#%]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${base} - ${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export async function uploadRecordingToOneDrive(input: {
  accessToken: string;
  audio: File;
  encounterId: string;
  title: string;
}) {
  const fileName = safeFileName(input.title, input.audio.name);
  const encodedName = encodeURIComponent(fileName).replace(/%2F/gi, "%252F");
  const sessionResponse = await graphFetch(
    `${GRAPH_API}/me/drive/special/approot:/${encodedName}:/createUploadSession`,
    input.accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "rename",
          name: fileName,
          description: `Ehllo encounter ${input.encounterId}`,
        },
      }),
    },
  );
  const session = await sessionResponse.json() as { uploadUrl?: string };
  if (!session.uploadUrl) throw new OneDriveError("OneDrive could not prepare the upload. Your local copy is still safe.", "upload");

  const bytes = new Uint8Array(await input.audio.arrayBuffer());
  let completed: { id?: string; webUrl?: string; name?: string } | null = null;
  for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, bytes.length);
    const response = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(end - start),
        "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}`,
        "Content-Type": input.audio.type || "application/octet-stream",
      },
      body: bytes.slice(start, end),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 401) throw new OneDriveError("Your Microsoft connection expired. Reconnect Microsoft and try again.", "reconnect");
      if (response.status === 507 || /quota|storageLimitExceeded/i.test(body)) throw new OneDriveError("Your OneDrive is full. Free some space, then try again.", "quota");
      throw new OneDriveError("The recording could not be saved to OneDrive. Your local copy is still safe.", "upload");
    }
    if (response.status === 200 || response.status === 201) {
      completed = await response.json() as { id?: string; webUrl?: string; name?: string };
    }
  }

  if (!completed?.id) throw new OneDriveError("OneDrive did not confirm the upload. Your local copy is still safe.", "upload");
  return { id: completed.id, webUrl: completed.webUrl, name: completed.name || fileName };
}

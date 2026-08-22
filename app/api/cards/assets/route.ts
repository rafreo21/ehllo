import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import {
  CARD_ASSETS_BUCKET,
  type CardAssetField,
  parseDataUrl,
  uploadCardAssetBuffer,
} from "../../../../lib/card-assets";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

const allowedFields = new Set<CardAssetField>(["photo", "coverPhoto", "companyLogo"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type JsonUploadBody = {
  cardId?: string;
  field?: string;
  dataUrl?: string;
};

async function readUploadPayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as JsonUploadBody | null;
    const cardId = String(body?.cardId || "").trim();
    const field = String(body?.field || "").trim() as CardAssetField;
    const dataUrl = String(body?.dataUrl || "").trim();
    if (!cardId || !allowedFields.has(field) || !dataUrl) {
      return { error: "A valid card, image field, and photo are required." as const, status: 400 as const };
    }
    const parsed = parseDataUrl(dataUrl);
    if (!parsed?.buffer.length) {
      return { error: "The uploaded photo could not be read." as const, status: 400 as const };
    }
    if (parsed.buffer.length > MAX_IMAGE_BYTES) {
      return { error: "Images must be 8 MB or smaller." as const, status: 413 as const };
    }
    return { cardId, field, buffer: parsed.buffer, mimeType: parsed.mimeType };
  }

  const formData = await request.formData();
  const cardId = String(formData.get("cardId") || "").trim();
  const field = String(formData.get("field") || "").trim() as CardAssetField;
  const file: unknown = formData.get("file");

  if (!cardId || !allowedFields.has(field)) {
    return { error: "A valid card and image field are required." as const, status: 400 as const };
  }

  let buffer: Buffer | null = null;
  let mimeType = "image/jpeg";
  let fileSize = 0;

  // File extends Blob, and some runtimes hand back a bare Blob rather than a
  // File. One check covers both.
  if (file instanceof Blob) {
    fileSize = file.size;
    mimeType = file.type || mimeType;
    buffer = Buffer.from(await file.arrayBuffer());
  }

  if (!buffer || fileSize <= 0) {
    return { error: "An image file is required." as const, status: 400 as const };
  }
  if (fileSize > MAX_IMAGE_BYTES) {
    return { error: "Images must be 8 MB or smaller." as const, status: 413 as const };
  }

  return { cardId, field, buffer, mimeType };
}

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ preview: true, url: "" }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const payload = await readUploadPayload(request);
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  const { cardId, field, buffer, mimeType } = payload;

  const supabase = await createApiSupabaseClient(request);
  const { data: card, error: cardError } = await supabase
    .from("cards")
    .select("id")
    .eq("id", cardId)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();

  if (cardError || !card) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Card image storage is not configured yet." }, { status: 503 });
  }

  try {
    const url = await uploadCardAssetBuffer(service, user.workspaceId, cardId, field, buffer, mimeType);
    return NextResponse.json({ ok: true, url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload this image." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ bucket: CARD_ASSETS_BUCKET });
}

import { NextResponse } from "next/server";

import { resolveApiUser } from "../../../../lib/auth/api-request";
import { extractEventInfoFromHtml } from "../../../../lib/event-link-extraction";
import { fetchExternalUrlSafely, UnsafeOutboundUrlError } from "../../../../lib/outbound-url-guard";

const MAX_HTML_BYTES = 2_000_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { url?: string } | null;
  const url = body?.url?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ error: "Paste a link to an event page." }, { status: 400 });
  }

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true });
  }

  let response: Response;
  try {
    response = await fetchExternalUrlSafely(url, {
      headers: { "User-Agent": "Ehllo-EventLinkPreview/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    const message = error instanceof UnsafeOutboundUrlError
      ? error.message
      : "We couldn’t open that link.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "We couldn’t open that link." }, { status: 400 });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "We couldn’t read that link." }, { status: 400 });
  }
  let html = "";
  let bytesRead = 0;
  const decoder = new TextDecoder();
  while (bytesRead < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});

  const extracted = extractEventInfoFromHtml(html);
  if (!extracted.title) {
    return NextResponse.json({ error: "We couldn’t find an event name on that page. Add the details manually instead." }, { status: 422 });
  }

  return NextResponse.json({ ok: true, event: extracted }, { headers: { "Cache-Control": "private, no-store" } });
}

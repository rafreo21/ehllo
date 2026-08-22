import { NextResponse } from "next/server";

/**
 * Where PassKit reports its own errors.
 *
 * Worth having rather than letting it 404: when a pass silently stops updating, this
 * is usually the only place that says why - a rejected certificate, a bad
 * webServiceURL, a token iOS would not accept. Apple sends these unauthenticated and
 * unprompted, so the endpoint exists to be read in logs, not to be trusted.
 *
 * Kept to console rather than a table on purpose. It is low volume, it is diagnostic
 * rather than something the product needs, and a public unauthenticated endpoint
 * that writes rows is a way to fill someone else's database.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { logs?: unknown };
    const logs = Array.isArray(body?.logs) ? body.logs : [];
    // Bounded: the array is attacker-controlled, and each entry is truncated because
    // these arrive as free text from a client we do not control.
    for (const entry of logs.slice(0, 20)) {
      console.warn("[apple-wallet] device log:", String(entry).slice(0, 500));
    }
  } catch {
    // A malformed body is not worth a non-200; Apple retries on failure and there is
    // nothing here to retry for.
  }
  return new NextResponse(null, { status: 200 });
}

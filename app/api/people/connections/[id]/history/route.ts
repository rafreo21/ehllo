import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../../lib/auth/api-request";

/**
 * The connection thread: one conversation both parties are looking at.
 *
 * Visibility is decided in get_connection_thread, not here, so mobile and web
 * cannot drift into disagreeing about it - the same mistake the four connection
 * RPCs made about reciprocity. Items reach whoever they concern, keyed on email:
 * a meeting everyone attended reaches everyone, a follow-up recorded against
 * three addresses reaches exactly those three. Transcripts and private notes
 * never cross, and a summary only crosses once the meeting is actually shared.
 *
 * Ownership is enforced inside the function too, since it is SECURITY DEFINER
 * and RLS does not apply to it. A connection belonging to another workspace
 * raises "connection not found" rather than returning an empty history, so this
 * cannot be used to probe which ids exist.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const { id } = await context.params;
  const connectionId = id?.trim();
  if (!connectionId) {
    return NextResponse.json({ error: "A connection id is required." }, { status: 400 });
  }

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase.rpc("get_connection_thread", { p_connection_id: connectionId });

  if (error) {
    // Say which cause it was. An unknown or foreign connection is a permanent
    // answer and the client should stop asking; a fault is worth retrying. The
    // scan route learned this the hard way - one friendly sentence for every
    // cause made a missing row indistinguishable from a broken database.
    console.error("[connection-thread] get_connection_thread failed", {
      connectionId,
      code: error.code,
      message: error.message,
    });
    if (error.message?.toLowerCase().includes("connection not found")) {
      return NextResponse.json(
        { code: "connection_not_found", error: "That connection isn’t available." },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: "We couldn’t load this shared history." }, { status: 500 });
  }

  return NextResponse.json(data ?? { items: [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

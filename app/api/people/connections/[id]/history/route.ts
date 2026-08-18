import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../../../lib/auth/api-request";

/**
 * The mutually-visible history between the two parties of a connection.
 *
 * What counts as mutually visible is decided in get_shared_history, not here,
 * so mobile and web cannot drift into disagreeing about it - which is the same
 * mistake the four connection RPCs made about reciprocity. Briefly: facts both
 * people already witnessed (when and where they met, invitations between them
 * and the response, subjects of emails that were actually delivered), never
 * capture notes, AI summaries, drafts, or anything queued but unsent.
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
  const { data, error } = await supabase.rpc("get_shared_history", { p_connection_id: connectionId });

  if (error) {
    // Say which cause it was. An unknown or foreign connection is a permanent
    // answer and the client should stop asking; a fault is worth retrying. The
    // scan route learned this the hard way - one friendly sentence for every
    // cause made a missing row indistinguishable from a broken database.
    console.error("[connection-history] get_shared_history failed", {
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

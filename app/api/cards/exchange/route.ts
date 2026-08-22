import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { provisionVisitorFromExchange } from "@/lib/visitor-provision-server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { resolveCurrentEventIdForWorkspace } from "@/lib/events-server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const visitorName = typeof body?.visitorName === "string" ? body.visitorName.trim() : "";
  const visitorEmail = typeof body?.visitorEmail === "string" ? body.visitorEmail.trim() : "";
  const visitorCompany = typeof body?.visitorCompany === "string" ? body.visitorCompany.trim() : "";
  const visitorRole = typeof body?.visitorRole === "string" ? body.visitorRole.trim() : "";
  const visitorPhone = typeof body?.visitorPhone === "string" ? body.visitorPhone.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const consentGiven = body?.consentGiven === true;

  if (!slug || visitorName.length < 2) {
    return NextResponse.json({ error: "Enter your name so they know who reached out." }, { status: 400 });
  }
  if (visitorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!consentGiven) {
    return NextResponse.json({ error: "Confirm you agree to share your details." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Capture is unavailable right now." }, { status: 503 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Best-effort: the card owner's currently-happening event, if any - an
  // anonymous visitor has no session of their own, so this is the only
  // "where did this exchange happen" signal available. Never blocks the
  // submission.
  let eventId: string | null = null;
  try {
    const service = createServiceSupabaseClient();
    if (service) {
      const { data: card } = await service
        .from("cards")
        .select("workspace_id")
        .eq("slug", slug.toLowerCase())
        .eq("status", "published")
        .maybeSingle();
      const workspaceId = card?.workspace_id as string | undefined;
      if (workspaceId) {
        eventId = await resolveCurrentEventIdForWorkspace(service, workspaceId);
      }
    }
  } catch {
    eventId = null;
  }

  const { data, error } = await supabase.rpc("submit_card_exchange", {
    p_slug: slug,
    p_visitor_name: visitorName,
    p_visitor_email: visitorEmail,
    p_visitor_company: visitorCompany,
    p_visitor_role: visitorRole,
    p_visitor_phone: visitorPhone,
    p_note: note,
    p_consent_given: consentGiven,
    p_event_id: eventId,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("card not found")) {
      return NextResponse.json({ error: "This card is not published yet." }, { status: 404 });
    }
    if (message.includes("consent")) {
      return NextResponse.json({ error: "Confirm you agree to share your details." }, { status: 400 });
    }
    return NextResponse.json({ error: "We couldn’t send your details. Try again in a moment." }, { status: 500 });
  }

  if (visitorEmail) {
    await provisionVisitorFromExchange({
      email: visitorEmail,
      displayName: visitorName,
      exchangeId: String(data),
      visitorCompany,
      visitorRole,
      visitorPhone,
      note,
    });
  }

  // Record the meeting now, both directions. Until this call an exchange
  // existed only as a card_exchanges row: the owner never saw the visitor in
  // People at all, and the visitor saw the owner only if they later signed in
  // and the email backfill happened to run. Both parties have a workspace by
  // this point - provisioning above creates one for the visitor - so there is
  // nothing left to defer.
  //
  // Best-effort: the details are captured either way, so a failure here must
  // not fail the submission. It must still say why, or this becomes another
  // silent one-way connect.
  try {
    const service = createServiceSupabaseClient();
    if (service) {
      const { error: connectionError } = await service.rpc("record_exchange_connection", {
        p_exchange_id: String(data),
      });
      if (connectionError) {
        console.error("[card-exchange] record_exchange_connection failed", {
          exchangeId: String(data),
          code: connectionError.code,
          message: connectionError.message,
        });
      }
    }
  } catch (caught) {
    console.error("[card-exchange] record_exchange_connection threw", {
      exchangeId: String(data),
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }

  return NextResponse.json({ ok: true, exchangeId: data }, { status: 201 });
}

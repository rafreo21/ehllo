import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { extractEncounterDraft } from "../../../../lib/encounter-extraction-server";
import type { ExtractionEventContext } from "../../../../lib/encounter-extraction";
import { resolveCurrentEventIdForUser } from "../../../../lib/events-server";
import { loadExtractionOwnerContext } from "../../../../lib/extraction-context-server";

export async function POST(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  const personName = typeof body?.personName === "string" ? body.personName.trim() : "";
  const personEmail = typeof body?.personEmail === "string" ? body.personEmail.trim() : "";
  const personPhone = typeof body?.personPhone === "string" ? body.personPhone.trim() : "";
  const people = Array.isArray(body?.people)
    ? body!.people
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const record = entry as Record<string, unknown>;
          const name = typeof record.name === "string" ? record.name.trim() : "";
          if (!name) return null;
          return {
            name,
            email: typeof record.email === "string" ? record.email.trim() : "",
            phone: typeof record.phone === "string" ? record.phone.trim() : "",
          };
        })
        .filter(Boolean) as Array<{ name: string; email?: string; phone?: string }>
    : [];

  if (transcript.length < 20) {
    return NextResponse.json({ error: "Add more transcript before generating context." }, { status: 400 });
  }

  try {
    const ownerContext = await loadExtractionOwnerContext(request, user);

    // Best-effort: if this encounter would passively attach to an event
    // (see resolveCurrentEventIdForUser), let the model know so it can
    // reference it naturally — never required, never invented if absent.
    const supabase = await createApiSupabaseClient(request);
    const currentEventId = await resolveCurrentEventIdForUser(supabase, user.id).catch(() => null);
    let eventContext: ExtractionEventContext | undefined;
    if (currentEventId) {
      const { data: eventRow } = await supabase
        .from("events")
        .select("title, location")
        .eq("id", currentEventId)
        .eq("workspace_id", user.workspaceId)
        .maybeSingle();
      if (eventRow?.title) {
        eventContext = { title: eventRow.title, location: eventRow.location || undefined };
      }
    }

    const result = await extractEncounterDraft(transcript, personName, ownerContext, {
      personEmail,
      personPhone,
      people,
    }, eventContext);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not extract meeting context.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

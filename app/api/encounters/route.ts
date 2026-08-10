import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createApiSupabaseClient, resolveApiUser } from "../../../lib/auth/api-request";
import { encounterFromApi, normalizeEncounterActions, type EncounterParticipant } from "../../../lib/encounters";
import { fetchParticipantsByEncounter } from "../../../lib/encounter-participants-server";
import { fetchGuestFollowUpsByEncounter } from "../../../lib/encounter-guest-follow-ups-server";
import { encounterMatchesConnection } from "../../../lib/follow-ups-server";
import { mergeRecordingMetadataForSave } from "../../../lib/recording-metadata";
import { detectEncounterConflict } from "../../../lib/encounter-conflict";
import { createNotification, notificationTypeEnabled } from "../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../lib/push-dispatch-server";
import { provisionGuestAccountFromContact } from "../../../lib/guest-contact-provision-server";
import { buildGuestAddedEmail } from "../../../lib/guest-added-email";
import { sendEmail } from "../../../lib/send-email";
import { applyFollowUpTransition } from "../../../lib/follow-up-lifecycle";

const allowedStatuses = new Set(["draft", "reviewed", "shared", "archived"]);

function parseIncomingParticipants(input: unknown): EncounterParticipant[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : crypto.randomUUID(),
        name: typeof record.name === "string" ? record.name.trim().slice(0, 160) : "",
        email: typeof record.email === "string" ? record.email.trim().slice(0, 320) : "",
        phone: typeof record.phone === "string" ? record.phone.trim().slice(0, 60) : "",
        linkedIn: typeof record.linkedIn === "string" ? record.linkedIn.trim().slice(0, 320) : "",
        exchangeId: typeof record.exchangeId === "string" && record.exchangeId.trim() ? record.exchangeId.trim() : undefined,
      } satisfies EncounterParticipant;
    })
    .filter((participant) => participant.name.length >= 2)
    .slice(0, 10);
}

function primaryProjection(participants: EncounterParticipant[]) {
  return {
    personName: participants.map((participant) => participant.name).join(", "),
    personEmail: participants.find((participant) => participant.email.includes("@"))?.email ?? "",
  };
}

async function syncEncounterParticipants(
  supabase: SupabaseClient,
  encounterId: string,
  workspaceId: string,
  participants: EncounterParticipant[],
) {
  await supabase.from("encounter_participants").delete().eq("encounter_id", encounterId);
  if (!participants.length) return;

  const rows = participants.map((participant, index) => ({
    id: participant.id,
    encounter_id: encounterId,
    workspace_id: workspaceId,
    display_name: participant.name,
    email: participant.email,
    phone: participant.phone,
    linkedin_url: participant.linkedIn,
    exchange_id: participant.exchangeId ?? null,
    is_primary: index === 0,
    sort_order: index,
  }));
  await supabase.from("encounter_participants").insert(rows);
}

function splitParticipantName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

// People typed manually into a capture only ever land in encounter_participants,
// which nothing outside that one encounter's detail view ever reads — they were
// invisible in Connections. Upserting them into contacts (already merged into
// the Connections list on both clients) closes that gap: existing contacts are
// matched by email and left as the source of truth, new ones are created with
// source "manual"; participants without an email dedupe on legacy_id instead so
// re-saving the same encounter doesn't spawn duplicates.
//
// A genuinely new contact with an email also gets a bare guest account (if
// they don't already have one) and a one-time "you were added" email —
// provision_personal_workspace() takes over the rest of onboarding the
// moment they actually sign in, so this only ever needs to create the
// auth.users row and point them at /auth.
async function syncParticipantsToContacts(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  addedByName: string,
  participants: EncounterParticipant[],
) {
  const newGuestNames: string[] = [];

  for (const participant of participants) {
    const email = participant.email.trim().toLowerCase();
    const { firstName, lastName } = splitParticipantName(participant.name);
    if (!firstName) continue;

    if (email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .ilike("email", email)
        .maybeSingle();
      if (existing) continue;

      await supabase.from("contacts").insert({
        workspace_id: workspaceId,
        created_by_user_id: userId,
        first_name: firstName,
        last_name: lastName,
        email: participant.email.trim(),
        phone: participant.phone,
        linkedin_url: participant.linkedIn,
        source: "manual",
      });

      try {
        const provisioned = await provisionGuestAccountFromContact({
          email: participant.email.trim(),
          displayName: participant.name.trim(),
        });
        if (provisioned.ok && provisioned.created) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://aftermeet.app";
          const { subject, html } = buildGuestAddedEmail({
            guestName: participant.name.trim(),
            addedByName,
            appUrl,
          });
          await sendEmail({ to: participant.email.trim(), subject, html });
          newGuestNames.push(participant.name.trim());
        }
      } catch {
        // Best-effort — the contact is already saved either way.
      }
    } else {
      await supabase.from("contacts").upsert({
        workspace_id: workspaceId,
        created_by_user_id: userId,
        first_name: firstName,
        last_name: lastName,
        phone: participant.phone,
        linkedin_url: participant.linkedIn,
        source: "manual",
        legacy_id: participant.id,
      }, { onConflict: "workspace_id,legacy_id" });
    }
  }

  return newGuestNames;
}

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ encounters: [], preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const url = new URL(request.url);
  const contactId = url.searchParams.get("contactId")?.trim() || "";
  const sourceId = url.searchParams.get("sourceId")?.trim() || "";
  const exchangeId = url.searchParams.get("exchangeId")?.trim() || "";
  const email = url.searchParams.get("email")?.trim().toLowerCase() || "";

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .eq("workspace_id", user.workspaceId)
    .order("started_at", { ascending: false })
    .limit(250);

  if (error) {
    return NextResponse.json({ error: "We couldn’t load your encounters." }, { status: 500 });
  }

  const encounterIds = (data ?? []).map((row) => row.id as string);
  const participantsByEncounter = await fetchParticipantsByEncounter(supabase, encounterIds);
  const guestFollowUpsByEncounter = await fetchGuestFollowUpsByEncounter(supabase, encounterIds);
  let encounters = (data ?? []).map((row) => encounterFromApi({
    ...row,
    participants: participantsByEncounter.get(row.id as string) ?? [],
    guest_follow_ups: guestFollowUpsByEncounter.get(row.id as string) ?? [],
  }));
  if (contactId || sourceId || exchangeId || email) {
    encounters = encounters.filter((encounter) => encounterMatchesConnection(encounter, {
      connectionId: contactId,
      sourceId,
      exchangeId,
      email,
    }));
  }

  return NextResponse.json({
    encounters,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "A valid encounter is required." }, { status: 400 });
  }

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const recording = body.recording && typeof body.recording === "object"
    ? body.recording as Record<string, unknown>
    : null;

  const supabase = await createApiSupabaseClient(request);
  const { data: existingRow } = await supabase
    .from("encounters")
    .select("recording_metadata, updated_at, status")
    .eq("id", body.id)
    .eq("workspace_id", user.workspaceId)
    .maybeSingle();

  // Optimistic concurrency: a caller that knows the row it last read (via
  // expectedUpdatedAt) gets rejected if someone else has written to it
  // since, rather than silently overwriting their edit. Callers that don't
  // send it (the capture wizard's in-progress autosave, where one device
  // owns the draft) keep today's last-write-wins behavior unchanged.
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (detectEncounterConflict(existingRow?.updated_at, expectedUpdatedAt)) {
    return NextResponse.json({
      error: "This meeting changed on another device. Reload to see the latest version before saving your changes.",
      conflict: true,
      serverUpdatedAt: existingRow?.updated_at,
    }, { status: 409 });
  }

  const existingRecording = existingRow?.recording_metadata && typeof existingRow.recording_metadata === "object"
    ? existingRow.recording_metadata as Record<string, unknown>
    : null;

  const recordingMetadata = mergeRecordingMetadataForSave(recording, existingRecording);
  if (recordingMetadata?.captureSession && body.status !== "draft") {
    recordingMetadata.captureSession = null;
  }

  const participants = parseIncomingParticipants(body.participants);
  const projection = participants.length
    ? primaryProjection(participants)
    : {
        personName: typeof body.personName === "string" ? body.personName.trim() : "",
        personEmail: typeof body.personEmail === "string" ? body.personEmail.trim() : "",
      };
  const nextStatus = typeof body.status === "string" && allowedStatuses.has(body.status) ? body.status : "draft";
  let actions = normalizeEncounterActions(body.actions, participants, {
    name: projection.personName,
    email: projection.personEmail,
  });

  // A follow-up suggested while a meeting is still a draft is only a proposal.
  // It becomes actionable exactly once the meeting has been reviewed or shared.
  if (nextStatus === "draft") {
    actions = actions.map((action) => action.status === "open"
      ? { ...action, status: "proposed" as const }
      : action);
  } else if (nextStatus === "reviewed" || nextStatus === "shared") {
    actions = actions.map((action) => action.status === "proposed"
      ? applyFollowUpTransition(action, "open")
      : action);
  }

  const nextUpdatedAt = new Date().toISOString();
  const { error } = await supabase.from("encounters").upsert({
    id: body.id,
    workspace_id: user.workspaceId,
    created_by_user_id: user.id,
    title: body.title.trim().slice(0, 160),
    person_name: projection.personName.slice(0, 160),
    person_email: projection.personEmail.slice(0, 320),
    contact_id: typeof body.contactId === "string" && body.contactId.trim() ? body.contactId.trim().slice(0, 120) : null,
    exchange_id: typeof body.exchangeId === "string" && body.exchangeId.trim() ? body.exchangeId.trim() : null,
    campaign_id: typeof body.campaignId === "string" && body.campaignId.trim() ? body.campaignId.trim().slice(0, 120) : null,
    started_at: body.startedAt,
    ended_at: body.endedAt,
    duration_seconds: typeof body.durationSeconds === "number" ? Math.max(0, Math.round(body.durationSeconds)) : 0,
    consent: body.consent,
    transcript: typeof body.transcript === "string" ? body.transcript : "",
    private_notes: typeof body.privateNotes === "string" ? body.privateNotes : "",
    shared_summary: typeof body.sharedSummary === "string" ? body.sharedSummary : "",
    actions,
    recording_metadata: recordingMetadata,
    status: nextStatus,
    share_token: typeof body.shareToken === "string" ? body.shareToken : crypto.randomUUID().replaceAll("-", ""),
    updated_at: nextUpdatedAt,
  }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: "The encounter was saved on this device but could not sync." }, { status: 500 });
  }

  await syncEncounterParticipants(supabase, body.id, user.workspaceId, participants);
  const newGuestNames = await syncParticipantsToContacts(supabase, user.workspaceId, user.id, user.displayName || "Someone you met", participants);

  // The encounter is reviewable — and its transcript actually has content —
  // the first time it is saved. This is the single place both mobile and
  // consumer web funnel through, so it is the one spot to raise
  // "review ready": one row per encounter, regardless of which client saved
  // it or how many times the save is retried (dedupe_key + unique index).
  const isNewEncounter = !existingRow;
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (isNewEncounter && (body.status ?? "draft") === "draft" && transcript.length >= 20) {
    try {
      const { data: preferenceRow } = await supabase
        .from("users")
        .select("notification_preferences")
        .eq("id", user.id)
        .maybeSingle();
      if (notificationTypeEnabled(preferenceRow?.notification_preferences, "review_ready")) {
        const title = projection.personName.trim()
          ? `Ready to review: ${projection.personName.trim()}`
          : "A capture is ready to review";
        const notificationBody = "Your follow-up choices are saved. Confirm the review to activate them.";
        const created = await createNotification(supabase, {
          userId: user.id,
          workspaceId: user.workspaceId,
          type: "review_ready",
          title,
          body: notificationBody,
          encounterId: body.id,
          dedupeKey: `review_ready:${body.id}`,
        });
        if (created) {
          await dispatchPushForUser(supabase, {
            userId: user.id,
            type: "review_ready",
            title,
            body: notificationBody,
            encounterId: body.id,
          });
        }
      }
    } catch {
      // Best-effort: a missed notification must never fail the save itself.
    }
  }

  return NextResponse.json(
    { ok: true, updatedAt: nextUpdatedAt, newGuestNames },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

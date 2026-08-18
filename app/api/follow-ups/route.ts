import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../lib/auth/api-request";
import { encounterFromApi } from "../../../lib/encounters";
import { fetchParticipantsByEncounter } from "../../../lib/encounter-participants-server";
import { fetchGuestFollowUpsByEncounter } from "../../../lib/encounter-guest-follow-ups-server";
import {
  flattenOpenFollowUps,
  followUpsForConnection,
  sortFollowUps,
  type FollowUpContactMethod,
} from "../../../lib/follow-ups-server";
import { contactFromRow, type ContactRow } from "../../../lib/contacts-server";

function contactMethods(contact: ReturnType<typeof contactFromRow>): FollowUpContactMethod[] {
  const candidates: Array<[FollowUpContactMethod["type"], string | undefined, string]> = [
    ["email", contact.email, "Email"],
    ["phone", contact.phone, "Phone"],
    ["linkedin", contact.linkedinUrl, "LinkedIn"],
    ["whatsapp", contact.whatsappUrl, "WhatsApp"],
    ["instagram", contact.instagramUrl, "Instagram"],
    ["x", contact.xUrl, "X"],
    ["tiktok", contact.tiktokUrl, "TikTok"],
  ];
  return candidates.flatMap(([type, value, label]) => value?.trim()
    ? [{ id: `${contact.id}-${type}`, type, value: value.trim(), label }]
    : []);
}

function participantMethods(
  participant: { id: string; email: string; phone: string; linkedIn: string } | undefined,
): FollowUpContactMethod[] {
  if (!participant) return [];
  return [
    participant.email.trim() ? { id: `${participant.id}-email`, type: "email" as const, value: participant.email.trim(), label: "Email" } : null,
    participant.phone.trim() ? { id: `${participant.id}-phone`, type: "phone" as const, value: participant.phone.trim(), label: "Phone" } : null,
    participant.linkedIn.trim() ? { id: `${participant.id}-linkedin`, type: "linkedin" as const, value: participant.linkedIn.trim(), label: "LinkedIn" } : null,
  ].filter((method): method is FollowUpContactMethod => method !== null);
}

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ followUps: [], preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const url = new URL(request.url);
  const connectionInput = {
    connectionId: url.searchParams.get("contactId")?.trim() || "",
    sourceId: url.searchParams.get("sourceId")?.trim() || "",
    exchangeId: url.searchParams.get("exchangeId")?.trim() || "",
    email: url.searchParams.get("email")?.trim() || "",
  };
  const hasConnectionFilter = Object.values(connectionInput).some(Boolean);

  const supabase = await createApiSupabaseClient(request);
  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .eq("workspace_id", user.workspaceId)
    .order("started_at", { ascending: false })
    .limit(250);

  if (error) {
    return NextResponse.json({ error: "We couldn’t load your follow-ups." }, { status: 500 });
  }

  const encounterIds = (data ?? []).map((row) => row.id as string);
  const participantsByEncounter = await fetchParticipantsByEncounter(supabase, encounterIds);
  const guestFollowUpsByEncounter = await fetchGuestFollowUpsByEncounter(supabase, encounterIds);
  const encounters = (data ?? []).map((row) => encounterFromApi({
    ...row,
    participants: participantsByEncounter.get(row.id as string) ?? [],
    guest_follow_ups: guestFollowUpsByEncounter.get(row.id as string) ?? [],
  }));
  const contactIds = [...new Set(encounters.map((encounter) => encounter.contactId).filter((id): id is string => Boolean(id)))];
  const contactsById = new Map<string, ReturnType<typeof contactFromRow>>();
  if (contactIds.length) {
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("*")
      .eq("workspace_id", user.workspaceId)
      .in("id", contactIds);
    for (const row of contactRows ?? []) {
      const contact = contactFromRow(row as ContactRow);
      contactsById.set(contact.id, contact);
    }
  }

  // "Where we met" / follow-up email opener context - event is an activator,
  // so this map only ever adds a title for encounters that actually have one.
  const eventIds = [...new Set(encounters.map((encounter) => encounter.eventId).filter((id): id is string => Boolean(id)))];
  const eventTitlesById = new Map<string, string>();
  if (eventIds.length) {
    const { data: eventRows } = await supabase
      .from("events")
      .select("id, title")
      .eq("workspace_id", user.workspaceId)
      .in("id", eventIds);
    for (const row of eventRows ?? []) {
      eventTitlesById.set(row.id as string, row.title as string);
    }
  }

  const flattened = flattenOpenFollowUps(encounters);
  const scoped = hasConnectionFilter
    ? followUpsForConnection(flattened, connectionInput)
    : flattened;
  const followUps = sortFollowUps(scoped).map((item) => {
    const participant = item.participantId
      ? item.participants.find((candidate) => candidate.id === item.participantId)
      : undefined;
    const participantContactMethods = participantMethods(participant);
    const contact = item.contactId ? contactsById.get(item.contactId) : undefined;
    return {
      ...item,
      contactMethods: participantContactMethods.length
        ? participantContactMethods
        : contact
          ? contactMethods(contact)
          : item.personEmail.trim()
            ? [{ id: `${item.actionId}-email`, type: "email" as const, value: item.personEmail.trim(), label: "Email" }]
            : [],
      eventTitle: item.eventId ? eventTitlesById.get(item.eventId) : undefined,
    };
  });

  return NextResponse.json({ followUps }, { headers: { "Cache-Control": "private, no-store" } });
}

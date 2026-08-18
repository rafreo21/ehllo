import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

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
  const candidates: Array<FollowUpContactMethod | null> = [
    participant.email.trim() ? { id: `${participant.id}-email`, type: "email", value: participant.email.trim(), label: "Email" } : null,
    participant.phone.trim() ? { id: `${participant.id}-phone`, type: "phone", value: participant.phone.trim(), label: "Phone" } : null,
    participant.linkedIn.trim() ? { id: `${participant.id}-linkedin`, type: "linkedin", value: participant.linkedIn.trim(), label: "LinkedIn" } : null,
  ];
  return candidates.filter((method): method is FollowUpContactMethod => method !== null);
}

/**
 * Contact methods from the person's own published card, keyed by their address.
 *
 * This was the missing source, and it is the one that matters most. A card is
 * where someone actually publishes how to reach them - Raphael's card carries a
 * phone, a LinkedIn and a website - but follow-ups only ever read the contacts
 * table and encounter_participants, both of which are populated from what the
 * *other* person happened to type during a capture. So a follow-up for someone
 * whose card lists a phone number reported that no phone number existed, and the
 * sheet degraded to "Not now" because it could not see an address either.
 */
async function cardMethodsByEmail(supabase: SupabaseClient, emails: string[]) {
  const wanted = [...new Set(emails.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  const byEmail = new Map<string, FollowUpContactMethod[]>();
  if (!wanted.length) return byEmail;

  // Which published card belongs to each address.
  const { data: owners, error: ownersError } = await supabase
    .from("card_methods")
    .select("card_id, value, cards!inner(status)")
    .eq("method_type", "email");
  if (ownersError) {
    console.error("[follow-ups] could not resolve cards for contact methods", {
      code: ownersError.code, message: ownersError.message,
    });
    return byEmail;
  }

  const cardIdByEmail = new Map<string, string>();
  for (const row of (owners ?? []) as unknown as Array<{ card_id: string; value: string; cards: { status: string } | null }>) {
    if (row.cards?.status !== "published") continue;
    const email = row.value.trim().toLowerCase();
    if (wanted.includes(email) && !cardIdByEmail.has(email)) cardIdByEmail.set(email, row.card_id);
  }
  if (!cardIdByEmail.size) return byEmail;

  const { data: methods, error: methodsError } = await supabase
    .from("card_methods")
    .select("card_id, method_type, value, label, sort_order")
    .in("card_id", [...cardIdByEmail.values()])
    .order("sort_order", { ascending: true });
  if (methodsError) {
    console.error("[follow-ups] could not read card contact methods", {
      code: methodsError.code, message: methodsError.message,
    });
    return byEmail;
  }

  for (const [email, cardId] of cardIdByEmail) {
    const rows = ((methods ?? []) as Array<{ card_id: string; method_type: string; value: string; label: string | null }>)
      .filter((row) => row.card_id === cardId && row.value.trim());
    byEmail.set(email, rows.map((row) => ({
      id: `${cardId}-${row.method_type}`,
      type: row.method_type as FollowUpContactMethod["type"],
      value: row.value.trim(),
      label: row.label?.trim() || row.method_type,
    })));
  }
  return byEmail;
}

/**
 * Merge, never replace. The participant row often holds the address while the
 * card holds the phone, so preferring one source wholesale loses whichever the
 * other one had - which is how this looked like "no phone number" for someone
 * who published one.
 */
function mergeMethods(...groups: FollowUpContactMethod[][]) {
  const byType = new Map<string, FollowUpContactMethod>();
  for (const group of groups) {
    for (const method of group) {
      if (!byType.has(method.type)) byType.set(method.type, method);
    }
  }
  return [...byType.values()];
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
  const ordered = sortFollowUps(scoped);

  const cardMethods = await cardMethodsByEmail(supabase, ordered.flatMap((item) => {
    const participant = item.participantId
      ? item.participants.find((candidate) => candidate.id === item.participantId)
      : undefined;
    const contact = item.contactId ? contactsById.get(item.contactId) : undefined;
    return [participant?.email ?? "", contact?.email ?? "", item.personEmail];
  }));

  const followUps = ordered.map((item) => {
    const participant = item.participantId
      ? item.participants.find((candidate) => candidate.id === item.participantId)
      : undefined;
    const contact = item.contactId ? contactsById.get(item.contactId) : undefined;
    const knownEmail = [participant?.email, contact?.email, item.personEmail]
      .map((value) => value?.trim().toLowerCase() || "")
      .find(Boolean) || "";

    return {
      ...item,
      contactMethods: mergeMethods(
        participantMethods(participant),
        contact ? contactMethods(contact) : [],
        item.personEmail.trim()
          ? [{ id: `${item.actionId}-email`, type: "email" as const, value: item.personEmail.trim(), label: "Email" }]
          : [],
        // Last, so anything captured about this person wins over the card - but
        // every method the card publishes and nobody typed still gets through.
        cardMethods.get(knownEmail) ?? [],
      ),
      eventTitle: item.eventId ? eventTitlesById.get(item.eventId) : undefined,
    };
  });

  return NextResponse.json({ followUps }, { headers: { "Cache-Control": "private, no-store" } });
}

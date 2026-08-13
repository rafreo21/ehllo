import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.AFTERMEET_E2E_STAGING === "1";
const appUrl = process.env.AFTERMEET_E2E_BASE_URL?.replace(/\/$/, "") ?? "";
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";

if (!enabled) throw new Error("Refusing to run without AFTERMEET_E2E_STAGING=1.");
if (!appUrl.includes("staging") || !supabaseUrl || !anonKey || !serviceKey) {
  throw new Error("E2E requires explicit staging app and Supabase configuration.");
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const hostEmail = `e2e-host-${runId}@example.invalid`;
const guestEmail = `e2e-guest-${runId}@example.invalid`;
const password = `E2e-${runId}-Aa9!`;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdAuthIds = [];

async function createSignedInUser(email) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw createError ?? new Error("Could not create E2E auth user.");
  createdAuthIds.push(created.user.id);
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw signInError ?? new Error("Could not sign in E2E user.");
  const { error: provisionError } = await client.rpc("provision_personal_workspace");
  if (provisionError) throw provisionError;
  return { client, token: signedIn.session.access_token };
}

async function api(path, token, init = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${payload.error ?? "unknown error"}`);
  return payload;
}

try {
  const host = await createSignedInUser(hostEmail);
  const { error: hostOnboardingError } = await host.client.rpc("complete_user_onboarding", {
    p_display_name: "E2E Host", p_time_zone: "Europe/London", p_locale: "en-GB",
  });
  if (hostOnboardingError) throw hostOnboardingError;

  const cardSlug = `e2e-${runId.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  const { data: cardId, error: publishCardError } = await host.client.rpc("publish_my_card", {
    p_slug: cardSlug,
    p_full_name: "E2E Host",
    p_job_title: "Staging Tester",
    p_company: "ehllo E2E",
    p_bio: "Temporary automated test card.",
    p_theme_color: "#9FE870",
    p_profile_image_url: "",
    p_company_logo_url: "",
    p_cover_image_url: "",
    p_methods: [{ type: "email", value: hostEmail, label: "Email", sortOrder: 0 }],
    p_show_company_details: true,
  });
  if (publishCardError || !cardId) throw publishCardError ?? new Error("Could not publish E2E card.");

  const publicCardResponse = await fetch(`${appUrl}/api/cards/public/${cardSlug}`);
  const publicCardPayload = await publicCardResponse.json();
  assert.equal(publicCardResponse.status, 200, "published card is anonymously readable");
  assert.equal(publicCardPayload.card?.fullName, "E2E Host", "public card returns approved identity fields");

  const qrResponse = await fetch(`${appUrl}/api/public/branded-qr/${cardSlug}?mode=contact&size=256`);
  assert.equal(qrResponse.status, 200, "offline contact QR renders");
  assert.equal(qrResponse.headers.get("content-type"), "image/png", "contact QR is a PNG");
  assert.ok((await qrResponse.arrayBuffer()).byteLength > 1000, "contact QR is non-empty");

  const vcardEventTitle = `E2E context ${runId}`;
  const vcardResponse = await fetch(`${appUrl}/c/${cardSlug}/contact.vcf?event=${encodeURIComponent(vcardEventTitle)}`);
  const vcard = await vcardResponse.text();
  assert.equal(vcardResponse.status, 200, "vCard export is publicly available");
  assert.match(vcard, /BEGIN:VCARD/);
  assert.ok(vcard.includes(`Where we met: ${vcardEventTitle}`), "vCard Notes contains where-we-met context");

  const walletStatus = await api("/api/mobile/wallet/status", host.token);
  assert.equal(walletStatus.google?.configured, true, "Google Wallet is configured on staging");
  const wallet = await api(`/api/mobile/wallet/google/${cardSlug}`, host.token);
  assert.match(wallet.saveUrl ?? "", /^https:\/\/pay\.google\.com\/gp\/v\/save\//, "published card produces a Google Wallet save URL");

  const cardLibrary = await api("/api/cards", host.token);
  const syncedCard = cardLibrary.cards?.find((card) => card.slug === cardSlug);
  assert.ok(syncedCard?.updatedAt, "card load returns a synchronization revision");
  const firstCardRevision = syncedCard.updatedAt;
  const updatedCard = await api("/api/cards", host.token, {
    method: "POST",
    body: JSON.stringify({ ...syncedCard, label: "Updated elsewhere", expectedUpdatedAt: firstCardRevision }),
  });
  assert.notEqual(updatedCard.card?.updatedAt, firstCardRevision, "fresh card revision updates successfully");
  const staleCardResponse = await fetch(`${appUrl}/api/cards`, {
    method: "POST",
    headers: { Authorization: `Bearer ${host.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...syncedCard, label: "Stale overwrite", expectedUpdatedAt: firstCardRevision }),
  });
  const staleCardPayload = await staleCardResponse.json();
  assert.equal(staleCardResponse.status, 409, "stale card update is rejected");
  assert.equal(staleCardPayload.conflict, true, "card save conflict is explicit to the client");
  const stalePublishResponse = await fetch(`${appUrl}/api/cards/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${host.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...syncedCard, expectedUpdatedAt: firstCardRevision }),
  });
  const stalePublishPayload = await stalePublishResponse.json();
  assert.equal(stalePublishResponse.status, 409, "stale card publish is rejected");
  assert.equal(stalePublishPayload.conflict, true, "card publish conflict is explicit to the client");
  const cardsAfterConflict = await api("/api/cards", host.token);
  const cardAfterConflict = cardsAfterConflict.cards?.find((card) => card.id === updatedCard.card.id);
  assert.equal(cardAfterConflict?.label, "Updated elsewhere", "stale card writes cannot overwrite newer data");

  const contactSeed = {
    id: `e2e-contact-${runId}`,
    firstName: "Conflict",
    lastName: "Check",
    email: `contact-${runId}@example.com`,
    company: "ehllo E2E",
    role: "Original",
    context: "Temporary cross-device conflict fixture.",
    source: "manual",
  };
  const savedContact = await api("/api/contacts", host.token, {
    method: "POST",
    body: JSON.stringify(contactSeed),
  });
  assert.ok(savedContact.contact?.updatedAt, "contact save returns a synchronization revision");
  const firstRevision = savedContact.contact.updatedAt;
  const updatedContact = await api("/api/contacts", host.token, {
    method: "POST",
    body: JSON.stringify({ ...savedContact.contact, role: "Updated elsewhere", updatedAt: firstRevision }),
  });
  assert.notEqual(updatedContact.contact?.updatedAt, firstRevision, "fresh contact revision updates successfully");
  const staleContactResponse = await fetch(`${appUrl}/api/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${host.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...savedContact.contact, role: "Stale overwrite", updatedAt: firstRevision }),
  });
  const staleContactPayload = await staleContactResponse.json();
  assert.equal(staleContactResponse.status, 409, "stale contact update is rejected");
  assert.equal(staleContactPayload.conflict, true, "contact conflict is explicit to the client");
  const contactsAfterConflict = await api("/api/contacts", host.token);
  const contactAfterConflict = contactsAfterConflict.contacts?.find((contact) => contact.id === updatedContact.contact.id);
  assert.equal(contactAfterConflict?.role, "Updated elsewhere", "stale contact update cannot overwrite newer data");

  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const created = await api("/api/events", host.token, {
    method: "POST",
    body: JSON.stringify({ title: `E2E event ${runId}`, location: "Staging test venue", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }),
  });
  assert.ok(created.event?.id, "event creation returns an id");
  assert.ok(created.event?.updatedAt, "event creation returns a synchronization revision");
  const eventId = created.event.id;
  const firstEventRevision = created.event.updatedAt;

  await api(`/api/events/${eventId}/attendance`, host.token, { method: "PATCH", body: JSON.stringify({ status: "going" }) });

  const encounterId = crypto.randomUUID();
  const actionId = crypto.randomUUID();
  const captureStartedAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const captureEndedAt = new Date(captureStartedAt.getTime() + 12 * 60 * 1000);
  const dueAt = new Date().toISOString().slice(0, 10);
  const capture = await api("/api/encounters", host.token, {
    method: "POST",
    body: JSON.stringify({
      id: encounterId,
      title: `Meeting with E2E Connection ${runId}`,
      personName: "E2E Connection",
      personEmail: "",
      participants: [{ id: crypto.randomUUID(), name: "E2E Connection", email: "", phone: "", linkedIn: "" }],
      startedAt: captureStartedAt.toISOString(),
      endedAt: captureEndedAt.toISOString(),
      durationSeconds: 720,
      consent: { confirmed: true, method: "verbal", confirmedAt: captureStartedAt.toISOString(), scriptVersion: "2026-07-26" },
      transcript: "We discussed the staging release and agreed to send a concise project update tomorrow.",
      privateNotes: "Met at the automated staging event.",
      sharedSummary: "Discussed the staging release.",
      actions: [{ id: actionId, title: "Send project update", channel: "email", owner: "me", dueAt, status: "open", assigneeName: "E2E Connection" }],
      status: "reviewed",
      shareToken: crypto.randomUUID().replaceAll("-", ""),
      eventId,
    }),
  });
  assert.equal(capture.eventId, eventId, "capture keeps explicit current-event context");

  const encounters = await api("/api/encounters", host.token);
  const savedEncounter = encounters.encounters?.find((encounter) => encounter.id === encounterId);
  assert.equal(savedEncounter?.eventId, eventId, "saved capture returns its event context");
  assert.equal(savedEncounter?.privateNotes, "Met at the automated staging event.", "private notes survive synchronization");
  assert.ok(savedEncounter?.updatedAt, "capture load returns a synchronization revision");
  const firstEncounterRevision = savedEncounter.updatedAt;
  const revisedEncounter = await api("/api/encounters", host.token, {
    method: "POST",
    body: JSON.stringify({ ...savedEncounter, privateNotes: "Updated on the other device.", expectedUpdatedAt: firstEncounterRevision }),
  });
  assert.notEqual(revisedEncounter.updatedAt, firstEncounterRevision, "fresh encounter revision updates successfully");
  const staleEncounterResponse = await fetch(`${appUrl}/api/encounters`, {
    method: "POST",
    headers: { Authorization: `Bearer ${host.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...savedEncounter, privateNotes: "Stale private note overwrite.", expectedUpdatedAt: firstEncounterRevision }),
  });
  const staleEncounterPayload = await staleEncounterResponse.json();
  assert.equal(staleEncounterResponse.status, 409, "stale encounter update is rejected atomically");
  assert.equal(staleEncounterPayload.conflict, true, "encounter conflict is explicit to the client");
  const encounterAfterConflictResponse = await api(`/api/encounters/${encounterId}`, host.token);
  assert.equal(encounterAfterConflictResponse.encounter?.privateNotes, "Updated on the other device.", "stale encounter update cannot overwrite newer private notes");

  const followUps = await api("/api/follow-ups", host.token);
  const openFollowUp = followUps.followUps?.find((item) => item.encounterId === encounterId && item.actionId === actionId);
  assert.equal(openFollowUp?.status, "open", "reviewed capture creates an actionable follow-up");
  assert.equal(openFollowUp?.eventId, eventId, "follow-up inherits event context");
  assert.equal(openFollowUp?.eventTitle, `E2E event ${runId}`, "follow-up resolves the event title");

  const firstActionRevision = savedEncounter.actions?.find((action) => action.id === actionId)?.statusUpdatedAt ?? null;
  await api(`/api/encounters/${encounterId}/actions/${actionId}`, host.token, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed", expectedStatusUpdatedAt: firstActionRevision }),
  });
  const staleFollowUpResponse = await fetch(`${appUrl}/api/encounters/${encounterId}/actions/${actionId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${host.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "dismissed", expectedStatusUpdatedAt: firstActionRevision }),
  });
  const staleFollowUpPayload = await staleFollowUpResponse.json();
  assert.equal(staleFollowUpResponse.status, 409, "stale follow-up lifecycle update is rejected");
  assert.equal(staleFollowUpPayload.conflict, true, "follow-up conflict is explicit to the client");
  const completedFollowUps = await api("/api/follow-ups", host.token);
  const completedFollowUp = completedFollowUps.followUps?.find((item) => item.encounterId === encounterId && item.actionId === actionId);
  assert.equal(completedFollowUp?.status, "completed", "follow-up completion persists across refresh");
  assert.ok(completedFollowUp?.completedAt, "completion receives an audit timestamp");

  const invitation = await api(`/api/events/${eventId}/invitations`, host.token, { method: "POST", body: JSON.stringify({ email: guestEmail }) });
  assert.match(invitation.guestUrl, /\/event\//, "invitation returns a guest URL");
  const inviteToken = decodeURIComponent(new URL(invitation.guestUrl).pathname.split("/").pop());

  const rsvpResponse = await fetch(`${appUrl}/api/event-invitations/${encodeURIComponent(inviteToken)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "going" }),
  });
  assert.equal(rsvpResponse.status, 200, "guest can RSVP without an account");

  const guest = await createSignedInUser(guestEmail);
  const { error: guestOnboardingError } = await guest.client.rpc("complete_visitor_onboarding", { p_display_name: "E2E Guest" });
  if (guestOnboardingError) throw guestOnboardingError;
  const { data: claimedEventId, error: claimError } = await guest.client.rpc("claim_event_invitation", { p_token: inviteToken });
  if (claimError) throw claimError;
  assert.equal(claimedEventId, eventId, "claim keeps the canonical event id");

  const guestEvents = await api("/api/events", guest.token);
  assert.ok(guestEvents.events?.some((event) => event.id === eventId), "claimed event appears in the guest account");

  const movedStart = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const rescheduled = await api(`/api/events/${eventId}`, host.token, { method: "PATCH", body: JSON.stringify({ startsAt: movedStart.toISOString(), endsAt: new Date(movedStart.getTime() + 2 * 60 * 60 * 1000).toISOString(), expectedUpdatedAt: firstEventRevision }) });
  assert.notEqual(rescheduled.event?.updatedAt, firstEventRevision, "fresh event revision updates successfully");
  const staleEventResponse = await fetch(`${appUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${host.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Stale event overwrite", expectedUpdatedAt: firstEventRevision }),
  });
  const staleEventPayload = await staleEventResponse.json();
  assert.equal(staleEventResponse.status, 409, "stale event update is rejected atomically");
  assert.equal(staleEventPayload.conflict, true, "event conflict is explicit to the client");
  assert.equal(Date.parse(staleEventPayload.event?.startsAt ?? ""), movedStart.getTime(), "event conflict returns the latest version");
  const refreshedGuestEvents = await api("/api/events", guest.token);
  assert.equal(
    Date.parse(refreshedGuestEvents.events.find((event) => event.id === eventId)?.startsAt ?? ""),
    movedStart.getTime(),
    "reschedule propagates to guest",
  );

  await api(`/api/events/${eventId}`, host.token, { method: "PATCH", body: JSON.stringify({ status: "cancelled", expectedUpdatedAt: rescheduled.event.updatedAt }) });
  const cancelledGuestEvents = await api("/api/events", guest.token);
  assert.ok(!cancelledGuestEvents.events?.some((event) => event.id === eventId), "cancelled event leaves active guest events");
  const publicInvitation = await fetch(`${appUrl}/api/event-invitations/${encodeURIComponent(inviteToken)}`);
  const publicPayload = await publicInvitation.json();
  assert.equal(publicPayload.invitation?.event?.status, "cancelled", "original guest link shows cancellation");

  console.log(JSON.stringify({ ok: true, journey: "signup-card-qr-vcard-wallet-card-conflict-contact-conflict-capture-conflict-followup-conflict-event-invite-rsvp-claim-reschedule-event-conflict-cancel", cleanup: "pending" }));
} finally {
  for (const id of createdAuthIds.reverse()) await admin.auth.admin.deleteUser(id);
  const { data: remaining } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leaked = remaining?.users?.filter((user) => user.email === hostEmail || user.email === guestEmail) ?? [];
  assert.equal(leaked.length, 0, "temporary auth users are removed");
  console.log(JSON.stringify({ cleanup: "complete", removedAuthUsers: createdAuthIds.length }));
}

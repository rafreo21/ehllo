import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "./send-email";

export type EventEmailKind = "invitation" | "schedule_changed" | "cancelled" | "reminder";

export async function enqueueEventEmail(supabase: SupabaseClient, input: {
  eventId: string;
  invitationId?: string;
  to: string;
  kind: EventEmailKind;
  subject: string;
  html: string;
  dedupeKey: string;
}) {
  const { data, error } = await supabase.from("event_email_outbox").upsert({
    event_id: input.eventId,
    invitation_id: input.invitationId ?? null,
    recipient_email: input.to,
    kind: input.kind,
    subject: input.subject,
    html: input.html,
    dedupe_key: input.dedupeKey,
    status: "pending",
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id, status").single();
  if (error || !data) {
    const { data: existing } = await supabase.from("event_email_outbox").select("id, status").eq("dedupe_key", input.dedupeKey).maybeSingle();
    if (existing) return existing as { id: string; status: string };
    throw error ?? new Error("Could not queue event email.");
  }
  return data as { id: string; status: string };
}

export async function deliverQueuedEventEmail(supabase: SupabaseClient, id: string) {
  const now = new Date();
  const { data: candidate } = await supabase.from("event_email_outbox").select("attempt_count").eq("id", id).maybeSingle();
  if (!candidate || Number(candidate.attempt_count) >= 8) return { ok: false };
  const attempts = Number(candidate.attempt_count) + 1;
  const { data: row } = await supabase.from("event_email_outbox").update({
    status: "processing", last_attempt_at: now.toISOString(), attempt_count: attempts, updated_at: now.toISOString(),
  }).eq("id", id).in("status", ["pending", "failed"]).lte("next_attempt_at", now.toISOString()).select("*").maybeSingle();
  if (!row) {
    const { data: existing } = await supabase.from("event_email_outbox").select("status").eq("id", id).maybeSingle();
    return { ok: existing?.status === "sent" };
  }
  const delivery = await sendEmail({ to: row.recipient_email, subject: row.subject, html: row.html });
  if (delivery.ok) {
    await supabase.from("event_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: "", updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: true };
  }

  const delayMinutes = Math.min(24 * 60, 5 * 2 ** Math.max(0, attempts - 1));
  await supabase.from("event_email_outbox").update({
    status: "failed",
    last_error: delivery.error.slice(0, 500),
    next_attempt_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  return { ok: false };
}

export async function retryDueEventEmails(supabase: SupabaseClient, limit = 200) {
  const { data } = await supabase.from("event_email_outbox").select("id")
    .in("status", ["pending", "failed"])
    .lt("attempt_count", 8)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const result = await deliverQueuedEventEmail(supabase, row.id);
    if (result.ok) sent += 1; else failed += 1;
  }
  return { scanned: data?.length ?? 0, sent, failed };
}

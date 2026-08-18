import { NextResponse } from "next/server";

import {
  buildKeepInTouchEmail,
  keepInTouchBody,
  keepInTouchTitle,
  type KeepInTouchThreshold,
} from "../../../../lib/keep-in-touch-email";
import { createNotification, notificationTypeEnabled } from "../../../../lib/notifications-server";
import { dispatchPushForUser } from "../../../../lib/push-dispatch-server";
import { sendEmail } from "../../../../lib/send-email";
import { createServiceSupabaseClient } from "../../../../lib/supabase/service";

const THRESHOLDS: KeepInTouchThreshold[] = [1, 3, 7, 30];
const GRACE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

type NudgeCandidate = {
  source: "met" | "inbound";
  sourceId: string;
  personName: string;
  personEmail: string;
  connectedAt: string;
};

function daysSince(iso: string, now: Date) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

/** The single threshold this connection is currently due for, if any - the
 * grace window means a threshold is only attempted for a few days after it's
 * crossed, so a years-old connection isn't re-checked forever. */
function dueThreshold(connectedAt: string, now: Date): KeepInTouchThreshold | null {
  const elapsed = daysSince(connectedAt, now);
  for (let index = THRESHOLDS.length - 1; index >= 0; index -= 1) {
    const threshold = THRESHOLDS[index];
    if (elapsed >= threshold && elapsed <= threshold + GRACE_DAYS) return threshold;
  }
  return null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Service client is not configured." }, { status: 503 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://ehllo.io";
  const now = new Date();
  const oldestRelevant = new Date(now.getTime() - (Math.max(...THRESHOLDS) + GRACE_DAYS) * DAY_MS).toISOString();

  const { data: users, error: usersError } = await service
    .from("users")
    .select("id, primary_email, status, reminder_emails_enabled, notification_preferences")
    .eq("status", "active")
    .limit(500);

  if (usersError) {
    return NextResponse.json({ error: "Could not load nudge recipients." }, { status: 500 });
  }

  let scanned = 0;
  let notificationsCreated = 0;
  let emailsSent = 0;

  for (const user of users ?? []) {
    scanned += 1;
    if (!notificationTypeEnabled(user.notification_preferences, "keep_in_touch")) continue;

    const { data: membership } = await service
      .from("workspace_memberships")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const workspaceId = membership?.workspace_id as string | undefined;
    if (!workspaceId) continue;

    const [{ data: metRows }, { data: inboundRows }] = await Promise.all([
      service
        .from("people_connections")
        .select("id, person_name, person_email, connected_at")
        .eq("workspace_id", workspaceId)
        .neq("person_email", "")
        .gte("connected_at", oldestRelevant)
        .limit(200),
      service
        .from("card_exchanges")
        .select("id, visitor_name, visitor_email, created_at")
        .eq("workspace_id", workspaceId)
        .neq("visitor_email", "")
        .gte("created_at", oldestRelevant)
        .limit(200),
    ]);

    const rawCandidates: NudgeCandidate[] = [
      ...(metRows ?? []).map((row) => ({
        source: "met" as const,
        sourceId: row.id as string,
        personName: (row.person_name as string) ?? "",
        personEmail: (row.person_email as string) ?? "",
        connectedAt: row.connected_at as string,
      })),
      ...(inboundRows ?? []).map((row) => ({
        source: "inbound" as const,
        sourceId: row.id as string,
        personName: (row.visitor_name as string) ?? "",
        personEmail: (row.visitor_email as string) ?? "",
        connectedAt: row.created_at as string,
      })),
    ];

    // One person can arrive twice: as a people_connections row, and as the
    // card_exchanges row that produced it. record_connection now writes the
    // reverse row for the exchange paths too, so that overlap is the normal
    // case rather than a rarity - and dedupeKey below includes `source`, so an
    // undeduped pair is two notifications, two pushes and two emails about the
    // same person. Collapse on the address; keep the earliest meeting, because
    // the nudge threshold is measured from when they actually met; prefer the
    // connection row so actionId points at something People can open.
    const byPerson = new Map<string, NudgeCandidate>();
    for (const candidate of rawCandidates) {
      const key = candidate.personEmail.trim().toLowerCase();
      if (!key) continue;
      const existing = byPerson.get(key);
      if (!existing) {
        byPerson.set(key, candidate);
        continue;
      }
      const earliest = Date.parse(candidate.connectedAt) < Date.parse(existing.connectedAt)
        ? candidate.connectedAt
        : existing.connectedAt;
      const preferred = existing.source === "met"
        ? existing
        : candidate.source === "met" ? candidate : existing;
      byPerson.set(key, { ...preferred, connectedAt: earliest });
    }
    const candidates = [...byPerson.values()];

    for (const candidate of candidates) {
      const threshold = dueThreshold(candidate.connectedAt, now);
      if (!threshold) continue;

      // Already engaged - a real encounter with this person after they
      // connected means they don't need a nudge to reach out.
      const { data: existingEncounter } = await service
        .from("encounters")
        .select("id")
        .eq("workspace_id", workspaceId)
        .ilike("person_email", candidate.personEmail)
        .gt("created_at", candidate.connectedAt)
        .limit(1)
        .maybeSingle();
      if (existingEncounter) continue;

      const title = keepInTouchTitle(threshold, candidate.personName);
      const body = keepInTouchBody(threshold, candidate.personName);
      const dedupeKey = `keep_in_touch:${candidate.source}:${candidate.sourceId}:${threshold}`;

      try {
        const created = await createNotification(service, {
          userId: user.id,
          workspaceId,
          type: "keep_in_touch",
          title,
          body,
          actionId: `${candidate.source}:${candidate.sourceId}`,
          dedupeKey,
        });
        if (!created) continue;
        notificationsCreated += 1;

        await dispatchPushForUser(service, {
          userId: user.id,
          type: "keep_in_touch",
          title,
          body,
          actionId: `${candidate.source}:${candidate.sourceId}`,
        });

        if (user.reminder_emails_enabled && user.primary_email?.trim()) {
          const { subject, html } = buildKeepInTouchEmail(threshold, candidate.personName, appUrl);
          const result = await sendEmail({ to: user.primary_email.trim(), subject, html });
          if (result.ok) emailsSent += 1;
        }
      } catch {
        // Best-effort - one missed nudge must never block the rest.
      }
    }
  }

  return NextResponse.json({ ok: true, scanned, notificationsCreated, emailsSent });
}

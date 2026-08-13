import { NextResponse } from "next/server";

import { getAppUser } from "../../../../lib/auth/context";
import { getConnectedAccountAccessToken } from "../../../../lib/integrations/connected-accounts";
import { createGoogleCalendarEvent, createMicrosoftCalendarEvent } from "../../../../lib/integrations/providers";
import type { IntegrationProvider } from "../../../../lib/integrations/types";

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    provider?: IntegrationProvider;
    title?: string;
    details?: string;
    dueAt?: string;
    attendeeEmail?: string;
  } | null;

  const provider = body?.provider;
  const title = body?.title?.trim() ?? "";
  const details = body?.details?.trim() ?? "";
  const dueAt = body?.dueAt?.trim() ?? "";
  const attendeeEmailRaw = body?.attendeeEmail?.trim() ?? "";
  const attendeeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendeeEmailRaw) ? attendeeEmailRaw : undefined;

  if ((provider !== "google" && provider !== "microsoft") || !title) {
    return NextResponse.json({ error: "A valid provider and meeting title are required." }, { status: 400 });
  }

  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const accessToken = await getConnectedAccountAccessToken(user, provider);
  if (!accessToken) {
    return NextResponse.json({ error: `Connect ${provider === "google" ? "Google" : "Microsoft"} before scheduling from Ehllo.` }, { status: 409 });
  }

  try {
    if (provider === "google") {
      await createGoogleCalendarEvent(accessToken, { title, details, dueAt, attendeeEmail });
    } else {
      await createMicrosoftCalendarEvent(accessToken, { title, details, dueAt, attendeeEmail });
    }
    return NextResponse.json({ ok: true, invited: Boolean(attendeeEmail) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "We couldn’t schedule this meeting.",
    }, { status: 500 });
  }
}

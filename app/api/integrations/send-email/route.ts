import { NextResponse } from "next/server";

import { getAppUser } from "../../../../lib/auth/context";
import { getConnectedAccountAccessToken } from "../../../../lib/integrations/connected-accounts";
import { sendGoogleEmail, sendMicrosoftEmail } from "../../../../lib/integrations/providers";
import type { IntegrationProvider } from "../../../../lib/integrations/types";

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    provider?: IntegrationProvider;
    to?: string;
    subject?: string;
    body?: string;
  } | null;

  const provider = body?.provider;
  const to = body?.to?.trim() ?? "";
  const subject = body?.subject?.trim() ?? "";
  const message = body?.body?.trim() ?? "";

  if ((provider !== "google" && provider !== "microsoft") || !to || !subject || !message) {
    return NextResponse.json({ error: "A valid provider, recipient, subject, and message are required." }, { status: 400 });
  }

  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const accessToken = await getConnectedAccountAccessToken(user, provider);
  if (!accessToken) {
    return NextResponse.json({ error: `Connect ${provider === "google" ? "Google" : "Microsoft"} before sending from ehllo.` }, { status: 409 });
  }

  try {
    if (provider === "google") {
      await sendGoogleEmail(accessToken, { to, subject, body: message });
    } else {
      await sendMicrosoftEmail(accessToken, { to, subject, body: message });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "We couldn’t send this message.",
    }, { status: 500 });
  }
}

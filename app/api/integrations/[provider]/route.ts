import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { deleteConnectedAccount } from "../../../../lib/integrations/connected-accounts";
import type { IntegrationProvider } from "../../../../lib/integrations/types";

const providers = new Set<IntegrationProvider>(["google", "microsoft"]);

export async function DELETE(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!providers.has(provider as IntegrationProvider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }

  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ ok: true, preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const client = await createApiSupabaseClient(request);
  await deleteConnectedAccount(user, provider as IntegrationProvider, client);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

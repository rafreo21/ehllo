import { NextResponse } from "next/server";

import { createApiSupabaseClient, resolveApiUser } from "../../../../lib/auth/api-request";
import { connectedAccountStatus } from "../../../../lib/integrations/connected-accounts";
import { emptyConnectedAccountStatus } from "../../../../lib/integrations/types";

export async function GET(request: Request) {
  const user = await resolveApiUser(request);
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (user.id === "local-development-preview") {
    return NextResponse.json({ status: emptyConnectedAccountStatus(), preview: true }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const client = await createApiSupabaseClient(request);
  const status = await connectedAccountStatus(user, client);
  return NextResponse.json({ status }, { headers: { "Cache-Control": "private, no-store" } });
}

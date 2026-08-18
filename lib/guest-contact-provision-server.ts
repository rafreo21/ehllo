import "server-only";

import { normalizeEmailForMatching } from "./contact-identity";
import { createServiceSupabaseClient } from "./supabase/service";

// Typo-tolerant on purpose - this only decides whether an account already
// exists, it never changes what gets stored for a new signup.
async function findAuthUserIdByEmail(
  admin: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  email: string,
) {
  const normalized = normalizeEmailForMatching(email);
  let page = 1;
  const perPage = 200;

  while (page <= 5) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data.users.length) break;
    const match = data.users.find((user) => normalizeEmailForMatching(user.email) === normalized);
    if (match) return match.id;
    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

/**
 * Creates a bare auth.users row for someone who was manually added as a
 * contact, if they don't already have an ehllo account. Deliberately
 * stops there - provision_personal_workspace() already creates their
 * workspace/card/draft card the moment they actually sign in, so duplicating
 * that here would risk drifting out of sync with the real onboarding path.
 */
export async function provisionGuestAccountFromContact(input: { email: string; displayName: string }) {
  const admin = createServiceSupabaseClient();
  if (!admin) return { ok: false as const, reason: "service_unavailable" };

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) return { ok: false as const, reason: "invalid_input" };

  const existingAuthUserId = await findAuthUserIdByEmail(admin, email);
  if (existingAuthUserId) return { ok: true as const, created: false };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName, signup_intent: "guest_added" },
  });

  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase() || "";
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      // Exact-string race: created between our lookup and this call.
      return { ok: true as const, created: false };
    }
    return { ok: false as const, reason: createError?.message || "auth_user_missing" };
  }

  return { ok: true as const, created: true };
}

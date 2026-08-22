import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmailForMatching } from "./contact-identity";
import { createServiceSupabaseClient } from "./supabase/service";

type VisitorExchangeInput = {
  email: string;
  displayName: string;
  exchangeId: string;
  visitorCompany?: string;
  visitorRole?: string;
  visitorPhone?: string;
  note?: string;
};

type CardMethod = {
  type: string;
  value: string;
  label: string;
  sortOrder: number;
};

function slugifyVisitor(name: string, email: string) {
  const fromName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  const fromEmail = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "visitor";
  const base = fromName || fromEmail;
  return `${base}-${fromEmail}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function parseSocialFromNote(note: string) {
  const social: Record<string, string> = {};
  for (const line of note.split("\n")) {
    const match = /^(X|Instagram|TikTok|LinkedIn):\s*(.+)$/i.exec(line.trim());
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (!value) continue;
    if (key === "x") social.x = value;
    else if (key === "instagram") social.instagram = value;
    else if (key === "tiktok") social.tiktok = value;
    else if (key === "linkedin") social.linkedin = value;
  }
  return social;
}

function buildVisitorMethods(input: VisitorExchangeInput): CardMethod[] {
  const methods: CardMethod[] = [];
  let sortOrder = 0;
  const email = input.email.trim().toLowerCase();
  if (email) {
    methods.push({ type: "email", value: email, label: "Email", sortOrder: sortOrder++ });
  }
  const phone = input.visitorPhone?.trim() || "";
  if (phone) {
    methods.push({ type: "phone", value: phone, label: "Phone", sortOrder: sortOrder++ });
  }
  const social = parseSocialFromNote(input.note || "");
  if (social.linkedin) {
    methods.push({ type: "linkedin", value: social.linkedin, label: "LinkedIn", sortOrder: sortOrder++ });
  }
  if (social.x) {
    methods.push({ type: "x", value: social.x, label: "X", sortOrder: sortOrder++ });
  }
  if (social.instagram) {
    methods.push({ type: "instagram", value: social.instagram, label: "Instagram", sortOrder: sortOrder++ });
  }
  if (social.tiktok) {
    methods.push({ type: "tiktok", value: social.tiktok, label: "TikTok", sortOrder: sortOrder++ });
  }
  return methods;
}

async function uniqueVisitorSlug(
  admin: SupabaseClient,
  name: string,
  email: string,
  preferred?: string,
) {
  const base = preferred?.trim().toLowerCase() || slugifyVisitor(name, email);
  let slug = base;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data } = await admin.from("cards").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

// Typo-tolerant on purpose - this only decides which existing account to
// reuse, it never changes what gets stored or emailed for a new signup.
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

async function provisionVisitorPublishedCard(
  admin: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  input: VisitorExchangeInput,
  authUserId: string,
) {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) return { ok: false as const, reason: "invalid_input" };

  const { data: userRow, error: userError } = await admin
    .from("users")
    .upsert(
      {
        auth_user_id: authUserId,
        primary_email: email,
        display_name: displayName,
        signup_intent: "visitor",
      },
      { onConflict: "auth_user_id" },
    )
    .select("id")
    .single();

  if (userError || !userRow?.id) {
    return { ok: false as const, reason: userError?.message || "user_provision_failed" };
  }

  const userId = userRow.id;

  const { data: workspaceRow, error: workspaceError } = await admin
    .from("workspaces")
    .upsert(
      { name: `${displayName}'s workspace`, owner_user_id: userId },
      { onConflict: "owner_user_id" },
    )
    .select("id")
    .single();

  if (workspaceError || !workspaceRow?.id) {
    return { ok: false as const, reason: workspaceError?.message || "workspace_provision_failed" };
  }

  const workspaceId = workspaceRow.id;

  await admin.from("workspace_memberships").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      status: "active",
    },
    { onConflict: "workspace_id,user_id" },
  );

  const { data: existingCard } = await admin
    .from("cards")
    .select("id, slug")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const slug = await uniqueVisitorSlug(admin, displayName, email, existingCard?.slug);
  const methods = buildVisitorMethods(input);
  const now = new Date().toISOString();

  const { data: cardRow, error: cardError } = await admin
    .from("cards")
    .upsert(
      {
        workspace_id: workspaceId,
        slug,
        full_name: displayName,
        job_title: input.visitorRole?.trim() || "",
        company: input.visitorCompany?.trim() || "",
        bio: "",
        theme_color: "#9FE870",
        status: "published",
        published_at: now,
        updated_at: now,
      },
      { onConflict: "workspace_id,slug" },
    )
    .select("id")
    .single();

  if (cardError || !cardRow?.id) {
    return { ok: false as const, reason: cardError?.message || "card_provision_failed" };
  }

  await admin.from("card_methods").delete().eq("card_id", cardRow.id);
  if (methods.length) {
    await admin.from("card_methods").insert(
      methods.map((method) => ({
        card_id: cardRow.id,
        method_type: method.type,
        value: method.value,
        label: method.label,
        sort_order: method.sortOrder,
      })),
    );
  }

  return { ok: true as const, slug, cardId: cardRow.id };
}

export async function provisionVisitorFromExchange(input: VisitorExchangeInput) {
  const admin = createServiceSupabaseClient();
  if (!admin) return { ok: false as const, reason: "service_unavailable" };

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) return { ok: false as const, reason: "invalid_input" };

  const metadata = {
    display_name: displayName,
    signup_intent: "visitor",
    pending_exchange_id: input.exchangeId,
  };

  // Check for an existing account under a typo-tolerant match first - a
  // literal typo (icloud.con vs icloud.com) is a different string to
  // Supabase auth, so createUser would otherwise happily succeed and create
  // a duplicate account instead of ever hitting the "already exists" path
  // below. The email stored/emailed for a genuinely new signup is always
  // exactly what was typed; only the lookup is typo-tolerant.
  let authUserId = await findAuthUserIdByEmail(admin, email);
  let wasCreated = false;

  if (authUserId) {
    await admin.auth.admin.updateUserById(authUserId, { user_metadata: metadata });
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata,
    });
    authUserId = created.user?.id || null;
    wasCreated = Boolean(created?.user);

    if (createError) {
      const message = createError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        // Exact-string race: created between our lookup and this call.
        authUserId = await findAuthUserIdByEmail(admin, email);
        if (authUserId) {
          await admin.auth.admin.updateUserById(authUserId, { user_metadata: metadata });
        }
      } else {
        return { ok: false as const, reason: createError.message };
      }
    }
  }

  if (!authUserId) {
    return { ok: false as const, reason: "auth_user_missing" };
  }

  const cardResult = await provisionVisitorPublishedCard(admin, input, authUserId);
  if (!cardResult.ok) {
    return cardResult;
  }

  return {
    ok: true as const,
    created: wasCreated,
    slug: cardResult.slug,
    cardId: cardResult.cardId,
  };
}

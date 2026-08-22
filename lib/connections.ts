import { normalizeEmailForMatching, normalizePhoneForMatching } from "./contact-identity";

export type ConnectionSource = "met" | "inbound" | "contact";
export type ConnectionSort = "date" | "az";

export type ConnectionItem = {
  id: string;
  sourceId: string;
  name: string;
  subtitle: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  source: ConnectionSource;
  cardSlug?: string;
  connectedAt?: string;
};

type PeopleConnection = {
  id: string;
  personName?: string;
  personRole?: string;
  personCompany?: string;
  personEmail?: string;
  cardSlug?: string;
  cardOwnerName?: string;
  connectedAt?: string;
};

type InboundExchange = {
  id: string;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  visitor_company?: string;
  visitor_role?: string;
  created_at?: string;
};

type ContactRow = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
};

function subtitle(role?: string, company?: string, fallback = "Connected through ehllo") {
  const parts = [role?.trim(), company?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}

function mergeKey(name: string, email?: string, phone?: string) {
  const normalizedEmail = normalizeEmailForMatching(email);
  if (normalizedEmail) return `email:${normalizedEmail}`;
  const normalizedPhone = normalizePhoneForMatching(phone);
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  return `name:${name.trim().toLowerCase()}`;
}

export function connectionAvatarUrl(connection: { name: string; photoUrl?: string }) {
  if (connection.photoUrl?.trim()) return connection.photoUrl.trim();
  const label = encodeURIComponent(connection.name.trim() || "Connection");
  return `https://ui-avatars.com/api/?name=${label}&background=E9F7DF&color=163300&size=128`;
}

export function connectionSourceLabel(source: ConnectionSource) {
  if (source === "inbound") return "Shared with you";
  if (source === "contact") return "Added by you";
  return "Saved card";
}

export function sortConnections(connections: ConnectionItem[], sort: ConnectionSort) {
  const next = [...connections];
  if (sort === "az") {
    next.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
    return next;
  }
  next.sort((left, right) => Date.parse(right.connectedAt || "0") - Date.parse(left.connectedAt || "0"));
  return next;
}

export function filterConnections(connections: ConnectionItem[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return connections;
  return connections.filter((connection) => (
    connection.name.toLowerCase().includes(needle)
    || connection.subtitle.toLowerCase().includes(needle)
    || (connection.email || "").toLowerCase().includes(needle)
  ));
}

export function parseConnectionId(value: string) {
  const match = /^(met|inbound|contact)-(.+)$/.exec(value.trim());
  if (!match) return null;
  return {
    source: match[1] as ConnectionSource,
    sourceId: match[2],
    id: value.trim(),
  };
}

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

export async function fetchAllConnectionsMerged(): Promise<ConnectionItem[]> {
  const [peopleRes, exchangesRes, contactsRes] = await Promise.all([
    fetch("/api/people/connections", { cache: "no-store" }),
    fetch("/api/cards/exchanges", { cache: "no-store" }),
    fetch("/api/contacts", { cache: "no-store" }),
  ]);

  const peoplePayload = peopleRes.ok
    ? await readJson<{ connections?: PeopleConnection[] }>(peopleRes)
    : { connections: [] };
  const exchangesPayload = exchangesRes.ok
    ? await readJson<{ exchanges?: InboundExchange[] }>(exchangesRes)
    : { exchanges: [] };
  const contactsPayload = contactsRes.ok
    ? await readJson<{ contacts?: ContactRow[] }>(contactsRes)
    : { contacts: [] };

  const people = peoplePayload.connections ?? [];
  const exchanges = exchangesPayload.exchanges ?? [];
  const contacts = contactsPayload.contacts ?? [];
  const merged = new Map<string, ConnectionItem>();

  for (const row of people) {
    const name = row.cardOwnerName?.trim() || row.personName?.trim() || "Connection";
    const item: ConnectionItem = {
      id: `met-${row.id}`,
      sourceId: row.id,
      name,
      subtitle: subtitle(row.personRole, row.personCompany),
      email: row.personEmail?.trim() || undefined,
      source: "met",
      cardSlug: row.cardSlug?.trim() || undefined,
      connectedAt: row.connectedAt,
      photoUrl: connectionAvatarUrl({ name }),
    };
    merged.set(mergeKey(name, item.email), item);
  }

  for (const exchange of exchanges) {
    const name = exchange.visitor_name?.trim() || "New connection";
    const item: ConnectionItem = {
      id: `inbound-${exchange.id}`,
      sourceId: exchange.id,
      name,
      role: exchange.visitor_role?.trim() || undefined,
      company: exchange.visitor_company?.trim() || undefined,
      subtitle: subtitle(exchange.visitor_role, exchange.visitor_company, "Shared their details with you"),
      email: exchange.visitor_email?.trim() || undefined,
      phone: exchange.visitor_phone?.trim() || undefined,
      source: "inbound",
      connectedAt: exchange.created_at,
      photoUrl: connectionAvatarUrl({ name }),
    };
    const key = mergeKey(name, item.email, item.phone);
    const existing = merged.get(key);
    if (!existing || existing.source === "contact") {
      merged.set(key, item);
    }
  }

  for (const contact of contacts) {
    const name = `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email?.trim() || "Contact";
    const item: ConnectionItem = {
      id: `contact-${contact.id}`,
      sourceId: contact.id,
      name,
      role: contact.role?.trim() || undefined,
      company: contact.company?.trim() || undefined,
      subtitle: subtitle(contact.role, contact.company, "Added by you"),
      email: contact.email?.trim() || undefined,
      phone: contact.phone?.trim() || undefined,
      source: "contact",
      photoUrl: connectionAvatarUrl({ name }),
    };
    const key = mergeKey(name, item.email, item.phone);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      continue;
    }
    if (existing.source === "inbound") {
      merged.set(key, {
        ...existing,
        ...item,
        id: existing.id,
        sourceId: existing.sourceId,
        source: "inbound",
        subtitle: existing.subtitle,
        connectedAt: existing.connectedAt || item.connectedAt,
      });
    }
  }

  return Array.from(merged.values());
}

export async function enrichConnectionPhotos(connections: ConnectionItem[]) {
  const slugs = [...new Set(connections.map((item) => item.cardSlug).filter(Boolean))] as string[];
  const photoEntries = await Promise.all(slugs.map(async (slug) => {
    try {
      const response = await fetch(`/api/cards/public/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!response.ok) return [slug, ""] as const;
      const payload = await response.json() as { card?: { profileImageUrl?: string } };
      return [slug, payload.card?.profileImageUrl || ""] as const;
    } catch {
      return [slug, ""] as const;
    }
  }));
  const photoMap = Object.fromEntries(photoEntries);

  return connections.map((connection) => {
    const photoFromCard = connection.cardSlug ? photoMap[connection.cardSlug] : "";
    const photoUrl = photoFromCard || connection.photoUrl;
    return {
      ...connection,
      photoUrl: photoUrl || connectionAvatarUrl(connection),
    };
  });
}

export async function createManualContact(input: {
  name: string;
  email?: string;
  role?: string;
  company?: string;
}) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error("Enter a name to save this connection.");

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Contact";
  const lastName = parts.slice(1).join(" ");
  const id = `manual-${Date.now()}`;

  const response = await fetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      firstName,
      lastName,
      email: input.email?.trim() || "",
      company: input.company?.trim() || "",
      role: input.role?.trim() || "",
      source: "manual",
    }),
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not save this connection.");
}

export async function deleteConnection(connection: ConnectionItem) {
  if (connection.source === "met") {
    const response = await fetch(`/api/people/connections/${encodeURIComponent(connection.sourceId)}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Could not remove this connection.");
    return;
  }

  if (connection.source === "inbound") {
    const response = await fetch("/api/cards/exchanges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: connection.sourceId, status: "dismissed" }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Could not remove this connection.");
    return;
  }

  const response = await fetch(`/api/contacts/${encodeURIComponent(connection.sourceId)}`, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not remove this contact.");
}

export async function updateConnectionName(connection: ConnectionItem, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Enter a name for this connection.");
  const url = connection.source === "contact"
    ? `/api/contacts/${encodeURIComponent(connection.sourceId)}`
    : connection.source === "met"
      ? `/api/people/connections/${encodeURIComponent(connection.sourceId)}`
      : "/api/cards/exchanges";
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(connection.source === "inbound" ? { id: connection.sourceId, name: cleanName } : { name: cleanName }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not update this connection.");
}

export function formatConnectionDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

import { normalizeEmailForMatching } from '@/lib/contact-identity';
import { mobileFetch } from '@/lib/mobile-api';
import type { EventSnapshot } from '@/features/events/event-cache';

import { lookupPublishedCardSlug } from './connection-card-loader';
import type { SavedDirectoryContact } from './connection-directory';
import {
  connectionAvatarUrl,
  fetchPublicConnectionCard,
} from './connection-public-card';

export type ConnectionSource = 'met' | 'inbound' | 'contact';

export type ConnectionSort = 'date' | 'az';

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
  eventId?: string;
  eventTitle?: string;
  eventLocation?: string;
  occurredAt?: string;
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
  eventId?: string;
  eventTitle?: string;
  eventLocation?: string;
  occurredAt?: string;
};

type InboundExchange = {
  id: string;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  visitor_company?: string;
  visitor_role?: string;
  note?: string;
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
  exchangeId?: string;
  legacyId?: string;
  linkedinUrl?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  xUrl?: string;
  tiktokUrl?: string;
  updatedAt?: string;
};

function subtitle(role?: string, company?: string, fallback = 'Connected through AfterMeet') {
  const parts = [role?.trim(), company?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : fallback;
}

function mergeKey(name: string, email?: string) {
  const normalizedEmail = normalizeEmailForMatching(email);
  if (normalizedEmail) return normalizedEmail;
  return name.trim().toLowerCase();
}

export async function fetchPeopleConnections(accessToken: string) {
  const response = await mobileFetch('/api/people/connections', accessToken);
  const payload = await response.json() as { connections?: PeopleConnection[]; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load people you’ve met.');
  }
  return payload.connections ?? [];
}

export async function fetchContacts(accessToken: string): Promise<SavedDirectoryContact[]> {
  const response = await mobileFetch('/api/contacts', accessToken);
  const payload = await response.json() as { contacts?: ContactRow[]; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load your contacts.');
  }
  return (payload.contacts ?? []).map((contact) => ({
    id: contact.id,
    firstName: contact.firstName?.trim() || 'Contact',
    lastName: contact.lastName?.trim() || '',
    email: contact.email?.trim() || '',
    phone: contact.phone?.trim() || undefined,
    linkedinUrl: contact.linkedinUrl?.trim() || undefined,
    whatsappUrl: contact.whatsappUrl?.trim() || undefined,
    instagramUrl: contact.instagramUrl?.trim() || undefined,
    xUrl: contact.xUrl?.trim() || undefined,
    tiktokUrl: contact.tiktokUrl?.trim() || undefined,
    company: contact.company?.trim() || '',
    role: contact.role?.trim() || '',
    exchangeId: contact.exchangeId,
    legacyId: contact.legacyId,
    updatedAt: contact.updatedAt,
  }));
}

export async function fetchInboundExchanges(accessToken: string) {
  const response = await mobileFetch('/api/cards/exchanges', accessToken);
  const payload = await response.json() as { exchanges?: InboundExchange[]; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load inbound connections.');
  }
  return payload.exchanges ?? [];
}

export async function enrichConnectionPhotos(accessToken: string, connections: ConnectionItem[]) {
  const withSlugs = await Promise.all(connections.map(async (connection) => {
    if (connection.cardSlug?.trim()) return connection;
    if (!connection.email?.trim()) return connection;
    const slug = await lookupPublishedCardSlug(accessToken, connection.email);
    return slug ? { ...connection, cardSlug: slug } : connection;
  }));

  const slugs = [...new Set(withSlugs.map((item) => item.cardSlug).filter(Boolean))] as string[];
  const photoEntries = await Promise.all(slugs.map(async (slug) => {
    const card = await fetchPublicConnectionCard(slug);
    return [slug, card?.profileImageUrl || ''] as const;
  }));
  const photoMap = Object.fromEntries(photoEntries);

  return withSlugs.map((connection) => {
    const photoFromCard = connection.cardSlug ? photoMap[connection.cardSlug] : '';
    const photoUrl = photoFromCard || connection.photoUrl;
    return {
      ...connection,
      photoUrl: photoUrl || connectionAvatarUrl(connection),
    };
  });
}

export async function registerScannedCard(
  accessToken: string,
  slug: string,
  eventSnapshot?: EventSnapshot,
): Promise<ConnectionItem | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) throw new Error('This QR code is not a valid AfterMeet card.');

  const response = await mobileFetch('/api/people/connections', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: normalized, eventSnapshot }),
  });
  const payload = await response.json() as { error?: string; connectionId?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Could not save this card to your connections.');
  }

  if (payload.connectionId) {
    return {
      id: `met-${payload.connectionId}`,
      sourceId: payload.connectionId,
      name: '',
      subtitle: '',
      source: 'met',
      cardSlug: normalized,
    };
  }

  const connections = await fetchAllConnectionsMerged(accessToken);
  return connections.find((item) => (
    item.source === 'met' && item.cardSlug?.trim().toLowerCase() === normalized
  )) ?? null;
}

export async function connectionFromScannedSlug(accessToken: string, slug: string, eventSnapshot?: EventSnapshot) {
  const normalized = slug.trim().toLowerCase();
  const connections = await fetchAllConnectionsMerged(accessToken);
  const existing = connections.find((item) => (
    item.cardSlug?.trim().toLowerCase() === normalized
  ));
  if (existing) return existing;

  return registerScannedCard(accessToken, normalized, eventSnapshot);
}

export async function fetchAllConnectionsMerged(accessToken: string): Promise<ConnectionItem[]> {
  const [people, exchanges, contacts] = await Promise.all([
    fetchPeopleConnections(accessToken).catch(() => [] as PeopleConnection[]),
    fetchInboundExchanges(accessToken).catch(() => [] as InboundExchange[]),
    fetchContacts(accessToken).catch(() => [] as SavedDirectoryContact[]),
  ]);

  const merged = new Map<string, ConnectionItem>();

  for (const row of people) {
    const name = row.cardOwnerName?.trim() || row.personName?.trim() || 'Connection';
    const item: ConnectionItem = {
      id: `met-${row.id}`,
      sourceId: row.id,
      name,
      subtitle: subtitle(row.personRole, row.personCompany),
      email: row.personEmail?.trim() || undefined,
      source: 'met',
      cardSlug: row.cardSlug?.trim() || undefined,
      connectedAt: row.connectedAt,
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      eventLocation: row.eventLocation,
      occurredAt: row.occurredAt,
      photoUrl: connectionAvatarUrl({ name, email: row.personEmail?.trim() || undefined } as ConnectionItem),
    };
    merged.set(mergeKey(name, item.email), item);
  }

  for (const exchange of exchanges) {
    const name = exchange.visitor_name?.trim() || 'New connection';
    const item: ConnectionItem = {
      id: `inbound-${exchange.id}`,
      sourceId: exchange.id,
      name,
      role: exchange.visitor_role?.trim() || undefined,
      company: exchange.visitor_company?.trim() || undefined,
      subtitle: subtitle(exchange.visitor_role, exchange.visitor_company, 'Shared their details with you'),
      email: exchange.visitor_email?.trim() || undefined,
      phone: exchange.visitor_phone?.trim() || undefined,
      source: 'inbound',
      connectedAt: exchange.created_at,
      photoUrl: connectionAvatarUrl({ name, email: exchange.visitor_email?.trim() || undefined } as ConnectionItem),
    };
    const key = mergeKey(name, item.email);
    const existing = merged.get(key);
    if (!existing || existing.source === 'contact') {
      merged.set(key, item);
    }
  }

  for (const contact of contacts) {
    const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email?.trim() || 'Contact';
    const item: ConnectionItem = {
      id: `contact-${contact.id}`,
      sourceId: contact.id,
      name,
      // Falls back to something distinct from "Added by you" — the source
      // label right above this on the connection detail screen already says
      // that, so repeating it here read as a visible duplicate.
      subtitle: subtitle(contact.role, contact.company, 'No role or company added yet'),
      email: contact.email?.trim() || undefined,
      phone: contact.phone?.trim() || undefined,
      source: 'contact',
      connectedAt: undefined,
      photoUrl: connectionAvatarUrl({ name, email: contact.email?.trim() || undefined } as ConnectionItem),
    };
    const key = mergeKey(name, item.email);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      continue;
    }
    if (existing.source === 'inbound') {
      merged.set(key, {
        ...existing,
        ...item,
        id: existing.id,
        sourceId: existing.sourceId,
        source: 'inbound',
        subtitle: existing.subtitle,
        connectedAt: existing.connectedAt || item.connectedAt,
      });
    }
  }

  return Array.from(merged.values());
}

export async function fetchAllConnections(accessToken: string): Promise<ConnectionItem[]> {
  const connections = await fetchAllConnectionsMerged(accessToken);
  return enrichConnectionPhotos(accessToken, connections);
}

export async function createManualContact(
  accessToken: string,
  input: { name: string; email?: string; role?: string; company?: string },
) {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Enter a name to save this connection.');

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Contact';
  const lastName = parts.slice(1).join(' ');
  const id = `manual-${Date.now()}`;

  const response = await mobileFetch('/api/contacts', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      firstName,
      lastName,
      email: input.email?.trim() || '',
      company: input.company?.trim() || '',
      role: input.role?.trim() || '',
      source: 'manual',
    }),
  });
  const payload = await response.json() as { error?: string; contact?: ContactRow };
  if (!response.ok) {
    throw new Error(payload.error || 'Could not save this connection.');
  }
  return payload.contact;
}

export function sortConnections(connections: ConnectionItem[], sort: ConnectionSort) {
  const next = [...connections];
  if (sort === 'az') {
    next.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    return next;
  }
  next.sort((left, right) => Date.parse(right.connectedAt || '0') - Date.parse(left.connectedAt || '0'));
  return next;
}

export function filterConnections(connections: ConnectionItem[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return connections;
  return connections.filter((connection) => (
    connection.name.toLowerCase().includes(needle)
    || connection.subtitle.toLowerCase().includes(needle)
    || (connection.email || '').toLowerCase().includes(needle)
  ));
}

export function connectionSourceLabel(source: ConnectionSource) {
  if (source === 'inbound') return 'Shared with you';
  if (source === 'contact') return 'Added by you';
  return 'Saved card';
}

export async function deleteConnection(accessToken: string, connection: ConnectionItem) {
  if (connection.source === 'met') {
    const response = await mobileFetch(`/api/people/connections/${encodeURIComponent(connection.sourceId)}`, accessToken, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not remove this connection.');
    return;
  }

  if (connection.source === 'inbound') {
    const response = await mobileFetch('/api/cards/exchanges', accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: connection.sourceId, status: 'dismissed' }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not remove this connection.');
    return;
  }

  const response = await mobileFetch(`/api/contacts/${encodeURIComponent(connection.sourceId)}`, accessToken, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not remove this contact.');
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

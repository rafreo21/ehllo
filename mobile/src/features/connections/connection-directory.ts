import type { MobileCard } from '@/features/card/types';
import { normalizeEmailForMatching } from '@/lib/contact-identity';

import type { ConnectionItem } from './connections-api';

export type SavedDirectoryContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  xUrl?: string;
  tiktokUrl?: string;
  company: string;
  role: string;
  exchangeId?: string;
  legacyId?: string;
  updatedAt?: string;
};

export type DirectoryFieldSnapshot = {
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  methods: string[];
};

const CONTACT_METHOD_TYPES = new Set(['email', 'phone', 'whatsapp', 'linkedin', 'instagram', 'website', 'x', 'tiktok']);

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

export function connectionDirectoryLegacyId(connection: ConnectionItem, cardSlug?: string | null) {
  const slug = cardSlug?.trim() || connection.cardSlug?.trim();
  if (slug) return `card-${slug.toLowerCase()}`;
  if (connection.source === 'inbound') return `exchange-${connection.sourceId}`;
  if (connection.source === 'met') return `met-${connection.sourceId}`;
  return `contact-${connection.sourceId}`;
}

export function findSavedDirectoryContact(
  contacts: SavedDirectoryContact[],
  connection: ConnectionItem,
  cardSlug?: string | null,
) {
  const legacyId = connectionDirectoryLegacyId(connection, cardSlug);
  const email = normalizeEmailForMatching(connection.email);

  return contacts.find((contact) => {
    if (contact.legacyId === legacyId) return true;
    if (connection.source === 'inbound' && contact.exchangeId === connection.sourceId) return true;
    if (email && normalizeEmailForMatching(contact.email) === email) return true;
    return false;
  }) ?? null;
}

function methodEntriesFromCard(card?: MobileCard | null) {
  return (card?.methods ?? [])
    .filter((method) => CONTACT_METHOD_TYPES.has(method.type) && method.value.trim())
    .map((method) => `${method.type}:${normalizeValue(method.value)}`)
    .sort();
}

export function directorySnapshotFromConnection(
  connection: ConnectionItem,
  card?: MobileCard | null,
): DirectoryFieldSnapshot {
  const cardEmail = card?.methods.find((method) => method.type === 'email')?.value || '';
  const cardPhone = card?.methods.find((method) => method.type === 'phone' || method.type === 'whatsapp')?.value || '';
  const cardLinkedin = card?.methods.find((method) => method.type === 'linkedin')?.value || '';

  return {
    name: (card?.name || connection.name).trim(),
    role: (card?.role || connection.role || '').trim(),
    company: (card?.company || connection.company || '').trim(),
    email: (cardEmail || connection.email || '').trim(),
    phone: (cardPhone || connection.phone || '').trim(),
    linkedinUrl: cardLinkedin.trim(),
    methods: methodEntriesFromCard(card),
  };
}

export function directorySnapshotFromContact(contact: SavedDirectoryContact): DirectoryFieldSnapshot {
  const methods: string[] = [];
  if (contact.email.trim()) methods.push(`email:${normalizeValue(contact.email)}`);
  if (contact.phone?.trim()) methods.push(`phone:${normalizeValue(contact.phone)}`);
  if (contact.linkedinUrl?.trim()) methods.push(`linkedin:${normalizeValue(contact.linkedinUrl)}`);
  if (contact.whatsappUrl?.trim()) methods.push(`whatsapp:${normalizeValue(contact.whatsappUrl)}`);
  if (contact.instagramUrl?.trim()) methods.push(`instagram:${normalizeValue(contact.instagramUrl)}`);
  if (contact.xUrl?.trim()) methods.push(`x:${normalizeValue(contact.xUrl)}`);
  if (contact.tiktokUrl?.trim()) methods.push(`tiktok:${normalizeValue(contact.tiktokUrl)}`);

  return {
    name: `${contact.firstName} ${contact.lastName}`.trim(),
    role: contact.role.trim(),
    company: contact.company.trim(),
    email: contact.email.trim(),
    phone: contact.phone?.trim() || '',
    linkedinUrl: contact.linkedinUrl?.trim() || '',
    methods: methods.sort(),
  };
}

export function directoryFieldChanges(saved: DirectoryFieldSnapshot, live: DirectoryFieldSnapshot) {
  const changes: string[] = [];

  if (normalizeValue(saved.name) !== normalizeValue(live.name) && live.name) changes.push('name');
  if (normalizeValue(saved.role) !== normalizeValue(live.role) && live.role) changes.push('role');
  if (normalizeValue(saved.company) !== normalizeValue(live.company) && live.company) changes.push('company');
  if (normalizeValue(saved.email) !== normalizeValue(live.email) && live.email) changes.push('email');
  if (normalizeValue(saved.phone) !== normalizeValue(live.phone) && live.phone) changes.push('phone');
  if (normalizeValue(saved.linkedinUrl) !== normalizeValue(live.linkedinUrl) && live.linkedinUrl) changes.push('LinkedIn');

  const savedMethods = new Set(saved.methods);
  const liveMethods = new Set(live.methods);
  for (const method of liveMethods) {
    if (!savedMethods.has(method)) changes.push('new contact method');
  }
  for (const method of savedMethods) {
    if (!liveMethods.has(method)) changes.push('removed contact method');
  }

  return [...new Set(changes)];
}

export function hasDirectoryFieldChanges(saved: DirectoryFieldSnapshot, live: DirectoryFieldSnapshot) {
  return directoryFieldChanges(saved, live).length > 0;
}

export type DirectorySaveState = 'unsaved' | 'saved' | 'needs_update';

export function resolveDirectorySaveState(
  savedContact: SavedDirectoryContact | null,
  connection: ConnectionItem,
  card?: MobileCard | null,
): DirectorySaveState {
  if (!savedContact) return 'unsaved';
  const saved = directorySnapshotFromContact(savedContact);
  const live = directorySnapshotFromConnection(connection, card);
  return hasDirectoryFieldChanges(saved, live) ? 'needs_update' : 'saved';
}

export function directoryUpdateSummary(
  savedContact: SavedDirectoryContact | null,
  connection: ConnectionItem,
  card?: MobileCard | null,
) {
  if (!savedContact) return '';
  const changes = directoryFieldChanges(
    directorySnapshotFromContact(savedContact),
    directorySnapshotFromConnection(connection, card),
  );
  if (!changes.length) return '';
  return `Updates: ${changes.slice(0, 3).join(', ')}${changes.length > 3 ? '…' : ''}`;
}

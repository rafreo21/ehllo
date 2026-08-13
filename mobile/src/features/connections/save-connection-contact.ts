import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addContactAsync,
  ContactTypes,
  Fields,
  getContactsAsync,
  requestPermissionsAsync,
  updateContactAsync,
} from 'expo-contacts/legacy';

import type { MobileCard } from '@/features/card/types';
import { normalizeEmailForMatching } from '@/lib/contact-identity';
import { mobileFetch } from '@/lib/mobile-api';

import { connectionDirectoryLegacyId } from './connection-directory';
import type { ConnectionItem } from './connections-api';

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Contact',
    lastName: parts.slice(1).join(' '),
  };
}

function contactPayloadFromConnection(connection: ConnectionItem, card?: MobileCard | null) {
  const { firstName, lastName } = splitName(card?.name || connection.name);
  const email = card?.methods.find((method) => method.type === 'email')?.value || connection.email || '';
  const phone = card?.methods.find((method) => method.type === 'phone' || method.type === 'whatsapp')?.value || connection.phone || '';
  const linkedinUrl = card?.methods.find((method) => method.type === 'linkedin')?.value;
  const whatsappUrl = card?.methods.find((method) => method.type === 'whatsapp')?.value;
  const instagramUrl = card?.methods.find((method) => method.type === 'instagram')?.value;
  const xUrl = card?.methods.find((method) => method.type === 'x')?.value;
  const tiktokUrl = card?.methods.find((method) => method.type === 'tiktok')?.value;

  const id = connectionDirectoryLegacyId(connection, card?.slug || connection.cardSlug);

  return {
    id,
    firstName,
    lastName,
    email,
    phone: phone || undefined,
    linkedinUrl: linkedinUrl || undefined,
    whatsappUrl: whatsappUrl || undefined,
    instagramUrl: instagramUrl || undefined,
    xUrl: xUrl || undefined,
    tiktokUrl: tiktokUrl || undefined,
    company: card?.company || connection.company || '',
    role: card?.role || connection.role || '',
    context: connection.subtitle,
    source: connection.source === 'inbound' ? 'exchange' as const : connection.source === 'met' ? 'scan' as const : 'manual' as const,
    exchangeId: connection.source === 'inbound' ? connection.sourceId : undefined,
  };
}

function deviceContactStorageKey(legacyId: string) {
  return `aftermeet:device-contact:${legacyId}`;
}

async function rememberDeviceContactId(legacyId: string, contactId: string) {
  await AsyncStorage.setItem(deviceContactStorageKey(legacyId), contactId);
}

async function readDeviceContactId(legacyId: string) {
  return AsyncStorage.getItem(deviceContactStorageKey(legacyId));
}

async function findDeviceContactId(connection: ConnectionItem, card?: MobileCard | null) {
  const legacyId = connectionDirectoryLegacyId(connection, card?.slug || connection.cardSlug);
  const stored = await readDeviceContactId(legacyId);
  if (stored) return stored;

  const email = card?.methods.find((method) => method.type === 'email')?.value || connection.email || '';
  if (!email.trim()) return null;

  const { data } = await getContactsAsync({
    fields: [Fields.ID, Fields.Emails, Fields.Name],
    pageSize: 50,
  });

  const normalizedEmail = normalizeEmailForMatching(email);
  const match = data.find((contact) => (
    contact.emails?.some((entry) => normalizeEmailForMatching(entry.email) === normalizedEmail)
  ));
  if (!match?.id) return null;

  await rememberDeviceContactId(legacyId, match.id);
  return match.id;
}

function buildDeviceContactFields(connection: ConnectionItem, card?: MobileCard | null) {
  const fullName = card?.name.trim() || connection.name.trim();
  const { firstName, lastName } = splitName(fullName);
  const emails = (card?.methods ?? [])
    .filter((method) => method.type === 'email')
    .map((method) => ({ label: 'work', email: method.value }));
  if (!emails.length && connection.email) {
    emails.push({ label: 'work', email: connection.email });
  }

  const phoneNumbers = (card?.methods ?? [])
    .filter((method) => method.type === 'phone' || method.type === 'whatsapp')
    .map((method) => ({ label: 'mobile', number: method.value }));
  if (!phoneNumbers.length && connection.phone) {
    phoneNumbers.push({ label: 'mobile', number: connection.phone });
  }

  const urlAddresses = (card?.methods ?? [])
    .filter((method) => ['linkedin', 'instagram', 'website', 'x'].includes(method.type))
    .map((method) => ({ label: method.label, url: method.value }));

  return {
    contactType: ContactTypes.Person,
    name: fullName,
    firstName,
    lastName,
    company: card?.company || connection.company || '',
    jobTitle: card?.role || connection.role || '',
    emails,
    phoneNumbers,
    urlAddresses,
  };
}

export async function saveConnectionToEhllo(accessToken: string, connection: ConnectionItem, card?: MobileCard | null) {
  const response = await mobileFetch('/api/contacts', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contactPayloadFromConnection(connection, card)),
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Could not save this person to your directory.');
  }

  if (connection.source === 'inbound') {
    await mobileFetch('/api/cards/exchanges', accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: connection.sourceId, status: 'imported' }),
    }).catch(() => {
      // directory save succeeded; exchange status is best-effort
    });
  }
}

export async function saveConnectionToDeviceContacts(connection: ConnectionItem, card?: MobileCard | null) {
  const permission = await requestPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Allow contacts access to save this person to your phone.');
  }

  const legacyId = connectionDirectoryLegacyId(connection, card?.slug || connection.cardSlug);
  const existingId = await findDeviceContactId(connection, card);
  const fields = buildDeviceContactFields(connection, card);

  if (existingId) {
    await updateContactAsync({ id: existingId, ...fields });
    await rememberDeviceContactId(legacyId, existingId);
    return;
  }

  const createdId = await addContactAsync(fields);
  if (createdId) await rememberDeviceContactId(legacyId, createdId);
}

export async function updateConnectionDirectory(
  accessToken: string,
  connection: ConnectionItem,
  card?: MobileCard | null,
) {
  await saveConnectionToEhllo(accessToken, connection, card);
  await saveConnectionToDeviceContacts(connection, card);
}

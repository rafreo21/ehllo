import type { EncounterAction, EncounterParticipant, EncounterPayload } from '@/features/encounters/encounter-api';
import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';
import { sortFollowUps } from '@/lib/due-date';
import type { ContactMethod } from '@/features/card/types';
import { requestFollowUpNotificationSync } from '@/features/notifications/notification-sync-events';

export type FollowUpItem = {
  encounterId: string;
  actionId: string;
  groupId?: string;
  title: string;
  channel: EncounterAction['channel'];
  dueAt: string;
  status: EncounterAction['status'];
  effectiveState?: 'proposed' | 'open' | 'scheduled' | 'due' | 'overdue' | 'snoozed' | 'completed' | 'dismissed' | 'cancelled';
  completedAt?: string;
  snoozedUntil?: string;
  dismissedAt?: string;
  cancelledAt?: string;
  statusUpdatedAt?: string;
  owner: EncounterAction['owner'];
  personName: string;
  personEmail: string;
  participantId?: string;
  participants: EncounterParticipant[];
  contactId?: string;
  exchangeId?: string;
  encounterTitle: string;
  startedAt: string;
  contactMethods: ContactMethod[];
  eventId?: string;
  /** The linked event's title, if any — event is an activator: absent means nothing about the follow-up's copy changes. */
  eventTitle?: string;
};

const followUpMethodTypes = new Set<ContactMethod['type']>([
  'email', 'phone', 'linkedin', 'whatsapp', 'instagram', 'x', 'tiktok',
]);

function mapContactMethods(value: unknown): ContactMethod[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const row = candidate as Record<string, unknown>;
    const type = String(row.type ?? '') as ContactMethod['type'];
    const methodValue = String(row.value ?? '').trim();
    if (!followUpMethodTypes.has(type) || !methodValue) return [];
    return [{
      id: String(row.id ?? `${type}-${methodValue}`),
      type,
      value: methodValue,
      label: String(row.label ?? type),
    }];
  });
}

export async function fetchFollowUps(
  accessToken: string,
  connection?: { connectionId: string; sourceId: string; email?: string; exchangeId?: string },
) {
  const params = new URLSearchParams();
  if (connection?.connectionId) params.set('contactId', connection.connectionId);
  if (connection?.sourceId) params.set('sourceId', connection.sourceId);
  if (connection?.email?.trim()) params.set('email', connection.email.trim());
  if (connection?.exchangeId?.trim()) params.set('exchangeId', connection.exchangeId.trim());
  const query = params.toString();
  const response = await mobileFetch(`/api/follow-ups${query ? `?${query}` : ''}`, accessToken);
  const payload = await readMobileApiJson<{ followUps?: Array<Record<string, unknown>>; error?: string }>(
    response,
    'Could not read follow-ups from AfterMeet.',
  );
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load follow-ups.');
  }
  return sortFollowUps((payload.followUps ?? []).map((row) => ({
    encounterId: String(row.encounterId ?? ''),
    actionId: String(row.actionId ?? ''),
    groupId: typeof row.groupId === 'string' ? row.groupId : undefined,
    title: String(row.title ?? ''),
    channel: row.channel as FollowUpItem['channel'],
    dueAt: String(row.dueAt ?? ''),
    status: row.status as FollowUpItem['status'],
    effectiveState: typeof row.effectiveState === 'string'
      ? row.effectiveState as FollowUpItem['effectiveState']
      : undefined,
    completedAt: typeof row.completedAt === 'string' ? row.completedAt : undefined,
    snoozedUntil: typeof row.snoozedUntil === 'string' ? row.snoozedUntil : undefined,
    dismissedAt: typeof row.dismissedAt === 'string' ? row.dismissedAt : undefined,
    cancelledAt: typeof row.cancelledAt === 'string' ? row.cancelledAt : undefined,
    statusUpdatedAt: typeof row.statusUpdatedAt === 'string' ? row.statusUpdatedAt : undefined,
    owner: (row.owner as FollowUpItem['owner']) ?? 'me',
    personName: String(row.personName ?? ''),
    personEmail: String(row.personEmail ?? ''),
    participantId: typeof row.participantId === 'string' ? row.participantId : undefined,
    participants: Array.isArray(row.participants) ? row.participants as EncounterParticipant[] : [],
    contactId: typeof row.contactId === 'string' ? row.contactId : undefined,
    exchangeId: typeof row.exchangeId === 'string' ? row.exchangeId : undefined,
    encounterTitle: String(row.encounterTitle ?? ''),
    startedAt: String(row.startedAt ?? ''),
    contactMethods: mapContactMethods(row.contactMethods),
    eventId: typeof row.eventId === 'string' ? row.eventId : undefined,
    eventTitle: typeof row.eventTitle === 'string' ? row.eventTitle : undefined,
  })));
}

async function updateFollowUpStatus(
  accessToken: string,
  encounterId: string,
  actionId: string,
  status: EncounterAction['status'],
  snoozedUntil?: string,
) {
  const response = await mobileFetch(`/api/encounters/${encounterId}/actions/${actionId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, snoozedUntil }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not read the follow-up completion response.',
  );
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not update this follow-up.');
  }
  requestFollowUpNotificationSync();
}

export async function completeFollowUp(accessToken: string, encounterId: string, actionId: string) {
  await updateFollowUpStatus(accessToken, encounterId, actionId, 'completed');
}

export async function reopenFollowUp(accessToken: string, encounterId: string, actionId: string) {
  await updateFollowUpStatus(accessToken, encounterId, actionId, 'open');
}

export async function dismissFollowUp(accessToken: string, encounterId: string, actionId: string) {
  await updateFollowUpStatus(accessToken, encounterId, actionId, 'dismissed');
}

export async function snoozeFollowUp(
  accessToken: string,
  encounterId: string,
  actionId: string,
  snoozedUntil: string,
) {
  await updateFollowUpStatus(accessToken, encounterId, actionId, 'snoozed', snoozedUntil);
}

export async function fetchEncounterRecords(accessToken: string) {
  const response = await mobileFetch('/api/encounters', accessToken);
  const payload = await readMobileApiJson<{ encounters?: Array<Record<string, unknown>>; error?: string }>(
    response,
    'Could not read meetings from AfterMeet.',
  );
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load encounters.');
  }
  return (payload.encounters ?? []).map((row) => mapEncounter(row));
}

export async function fetchEncountersForConnection(
  accessToken: string,
  input: { connectionId: string; sourceId: string; email?: string; exchangeId?: string },
) {
  const params = new URLSearchParams();
  if (input.connectionId) params.set('contactId', input.connectionId);
  if (input.sourceId) params.set('sourceId', input.sourceId);
  if (input.email?.trim()) params.set('email', input.email.trim());
  if (input.exchangeId?.trim()) params.set('exchangeId', input.exchangeId.trim());

  const response = await mobileFetch(`/api/encounters?${params.toString()}`, accessToken);
  const payload = await readMobileApiJson<{ encounters?: Array<Record<string, unknown>>; error?: string }>(
    response,
    'Could not read meetings for this person.',
  );
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load meetings.');
  }

  return (payload.encounters ?? []).map((row) => mapEncounter(row));
}

function mapEncounter(row: Record<string, unknown>): EncounterPayload {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    personName: String(row.personName ?? row.person_name ?? ''),
    personEmail: String(row.personEmail ?? row.person_email ?? ''),
    contactId: typeof row.contactId === 'string' ? row.contactId : typeof row.contact_id === 'string' ? row.contact_id : undefined,
    exchangeId: typeof row.exchangeId === 'string' ? row.exchangeId : typeof row.exchange_id === 'string' ? row.exchange_id : undefined,
    startedAt: String(row.startedAt ?? row.started_at ?? ''),
    endedAt: String(row.endedAt ?? row.ended_at ?? ''),
    durationSeconds: typeof row.durationSeconds === 'number' ? row.durationSeconds : Number(row.duration_seconds ?? 0),
    consent: row.consent as EncounterPayload['consent'],
    transcript: String(row.transcript ?? ''),
    privateNotes: String(row.privateNotes ?? row.private_notes ?? ''),
    sharedSummary: String(row.sharedSummary ?? row.shared_summary ?? ''),
    actions: Array.isArray(row.actions) ? row.actions as EncounterAction[] : [],
    participants: Array.isArray(row.participants) ? row.participants as EncounterPayload['participants'] : [],
    status: (row.status as EncounterPayload['status']) ?? 'draft',
    shareToken: String(row.shareToken ?? row.share_token ?? ''),
    recording: row.recording as EncounterPayload['recording'],
  };
}

export function followUpsForPerson(items: FollowUpItem[], personName: string, personEmail?: string) {
  const email = personEmail?.trim().toLowerCase() || '';
  const name = personName.trim().toLowerCase();
  return items.filter((item) => {
    const itemEmail = item.personEmail.trim().toLowerCase();
    const itemName = item.personName.trim().toLowerCase();
    if (email && itemEmail && itemEmail === email) return true;
    if (!name || !itemName) return false;
    if (itemName === name) return true;
    return itemName.includes(name) || name.includes(itemName);
  });
}

export async function requestContactField(
  accessToken: string,
  input: {
    targetEmail: string;
    targetExchangeId?: string;
    fieldType: string;
    channel: string;
    followUpTitle: string;
    encounterId?: string;
    actionId?: string;
  },
) {
  const response = await mobileFetch('/api/contact-requests', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not read the contact request response.',
  );
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not send this request.');
  }
}

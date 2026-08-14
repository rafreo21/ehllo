import type { EncounterAction, EncounterPayload } from '../encounters/encounter-api';

/** Converts encounter API/database shapes into the mobile history model. */
export function mapEncounterRow(row: Record<string, unknown>): EncounterPayload {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    personName: String(row.personName ?? row.person_name ?? ''),
    personEmail: String(row.personEmail ?? row.person_email ?? ''),
    contactId: typeof row.contactId === 'string' ? row.contactId : typeof row.contact_id === 'string' ? row.contact_id : undefined,
    exchangeId: typeof row.exchangeId === 'string' ? row.exchangeId : typeof row.exchange_id === 'string' ? row.exchange_id : undefined,
    eventId: typeof row.eventId === 'string' ? row.eventId : typeof row.event_id === 'string' ? row.event_id : undefined,
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

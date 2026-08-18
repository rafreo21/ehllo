import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';

/**
 * The connection thread: the same conversation both parties are looking at.
 *
 * The server decides what each person sees, per item, by email - a meeting
 * everyone attended reaches everyone, a follow-up recorded against three
 * addresses reaches exactly those three. Transcripts and private notes never
 * cross, and a summary only crosses once the meeting is actually shared.
 *
 * `mine` says whether the caller owns the underlying record. The screen uses it
 * to decide fidelity, not visibility: an owned meeting is joined to its local
 * copy so it still opens with its recording and notes, while the other party's
 * shows what they shared and nothing more.
 */
export type ConnectionThreadItem = {
  kind: 'met' | 'meeting' | 'follow_up' | 'event_invite' | 'email';
  at: string | null;
  id?: string | null;
  mine?: boolean;
  forMe?: boolean;
  title?: string | null;
  personName?: string | null;
  summary?: string | null;
  shared?: boolean;
  status?: string | null;
  note?: string | null;
  guestName?: string | null;
  channel?: string | null;
  dueAt?: string | null;
  committedAt?: string | null;
  direction?: 'outbound' | 'inbound';
  subject?: string | null;
  eventId?: string | null;
  eventTitle?: string | null;
  eventLocation?: string | null;
};

export type ConnectionThread = {
  connectionId: string;
  pairKey: string | null;
  personName: string | null;
  items: ConnectionThreadItem[];
};

export async function fetchConnectionThread(
  accessToken: string,
  connectionId: string,
): Promise<ConnectionThread> {
  const response = await mobileFetch(
    `/api/people/connections/${encodeURIComponent(connectionId)}/history`,
    accessToken,
  );
  const payload = await readMobileApiJson<ConnectionThread & { error?: string; code?: string }>(
    response,
    'Could not read the connection thread response.',
  );
  if (!response.ok) throw new Error(payload.error || 'Could not load this thread.');
  return {
    connectionId: payload.connectionId ?? connectionId,
    pairKey: payload.pairKey ?? null,
    personName: payload.personName ?? null,
    items: Array.isArray(payload.items) ? payload.items : [],
  };
}

import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';

/**
 * The history both parties can see, as decided by get_shared_history on the
 * server. Deliberately not merged with the private meeting timeline on the
 * connection screen: that one is your own record of them, this one is the part
 * they can see too, and showing them together would make the boundary a guess.
 */
export type SharedHistoryItem = {
  kind: 'met' | 'event_invite' | 'email';
  at: string | null;
  direction?: 'outbound' | 'inbound';
  eventId?: string | null;
  eventTitle?: string | null;
  eventLocation?: string | null;
  occurredAt?: string | null;
  status?: string | null;
  respondedAt?: string | null;
  emailKind?: string | null;
  subject?: string | null;
};

export type SharedHistory = {
  connectionId: string;
  pairKey: string | null;
  personName?: string | null;
  items: SharedHistoryItem[];
};

export async function fetchSharedHistory(accessToken: string, connectionId: string): Promise<SharedHistory> {
  const response = await mobileFetch(
    `/api/people/connections/${encodeURIComponent(connectionId)}/history`,
    accessToken,
  );
  const payload = await readMobileApiJson<SharedHistory & { error?: string; code?: string }>(
    response,
    'Could not read the shared history response.',
  );
  if (!response.ok) throw new Error(payload.error || 'Could not load the shared history.');
  return {
    connectionId: payload.connectionId ?? connectionId,
    pairKey: payload.pairKey ?? null,
    personName: payload.personName ?? null,
    items: Array.isArray(payload.items) ? payload.items : [],
  };
}

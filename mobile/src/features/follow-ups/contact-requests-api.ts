import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';

/**
 * Requests for your contact details, grouped by the person who asked.
 *
 * One request per row was the obvious shape and the wrong one. Somebody who asks for
 * your Instagram after every meeting produces fifteen identical rows, all wanting the
 * same answer, and answering them meant typing the same handle fifteen times. Worse,
 * the list was capped, so fifteen asks from one person could fill it and hide everybody
 * else. Grouped, that is one row, one answer, and the cap counts people.
 */
export type ContactRequestGroup = {
  /** Server-assigned, stable for a person-and-detail pair. Used as the list key. */
  key: string;
  requesterName: string;
  fieldType: string;
  /** Every pending ask in this group. All of them are answered together. */
  ids: string[];
  count: number;
  latestAt: string;
  followUpTitle: string;
};

export type IncomingContactRequests = {
  groups: ContactRequestGroup[];
  /** People waiting beyond what the server returned, so the list can say so. */
  truncated: number;
};

export async function fetchIncomingContactRequests(accessToken: string): Promise<IncomingContactRequests> {
  const response = await mobileFetch('/api/contact-requests', accessToken);
  const payload = await readMobileApiJson<{
    groups?: Record<string, unknown>[];
    groupsTruncated?: number;
    error?: string;
  }>(response, 'Could not load contact requests.');
  if (!response.ok) throw new Error(payload.error || 'Could not load contact requests.');

  const groups = (payload.groups ?? []).map((row) => ({
    key: String(row.key ?? ''),
    requesterName: String(row.requesterName ?? '').trim() || 'Someone',
    fieldType: String(row.fieldType ?? ''),
    ids: Array.isArray(row.ids) ? row.ids.map((id) => String(id)).filter(Boolean) : [],
    count: Number(row.count ?? 0) || 0,
    latestAt: String(row.latestAt ?? ''),
    followUpTitle: String(row.followUpTitle ?? ''),
  })).filter((row) => row.key && row.ids.length);

  return { groups, truncated: Number(payload.groupsTruncated ?? 0) || 0 };
}

/**
 * Answers a whole group. Declining is a real answer and is sent as one - the requester
 * is told either way, because silence is what made this feel broken. They are told once
 * regardless of how many asks were cleared; fifteen notifications for one answer is spam.
 */
export async function answerContactRequest(
  accessToken: string,
  input: { ids: string[]; share: boolean; value?: string },
): Promise<void> {
  const response = await mobileFetch('/api/contact-requests/answer', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: input.ids, share: input.share, value: input.value ?? '' }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not answer this request.',
  );
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not answer this request.');
}

import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';

/** A request somebody made for one of your contact details. */
export type IncomingContactRequest = {
  id: string;
  fieldType: string;
  channel: string;
  followUpTitle: string;
  createdAt: string;
};

/**
 * Requests waiting on you.
 *
 * The route has always returned these and nothing ever read them - the ask, the
 * record and the notification all worked, and there was nowhere to answer.
 */
export async function fetchIncomingContactRequests(accessToken: string): Promise<IncomingContactRequest[]> {
  const response = await mobileFetch('/api/contact-requests', accessToken);
  const payload = await readMobileApiJson<{ requests?: Record<string, unknown>[]; error?: string }>(
    response,
    'Could not load contact requests.',
  );
  if (!response.ok) throw new Error(payload.error || 'Could not load contact requests.');

  return (payload.requests ?? []).map((row) => ({
    id: String(row.id ?? ''),
    fieldType: String(row.field_type ?? ''),
    channel: String(row.channel ?? ''),
    followUpTitle: String(row.follow_up_title ?? ''),
    createdAt: String(row.created_at ?? ''),
  })).filter((row) => row.id);
}

/**
 * Answers one. Declining is a real answer and is sent as one - the requester is told
 * either way, because silence is what made this feel broken.
 */
export async function answerContactRequest(
  accessToken: string,
  input: { id: string; share: boolean; value?: string },
): Promise<void> {
  const response = await mobileFetch('/api/contact-requests/answer', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: input.id, share: input.share, value: input.value ?? '' }),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not answer this request.',
  );
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not answer this request.');
}

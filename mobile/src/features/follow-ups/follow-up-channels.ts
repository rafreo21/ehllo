export type FollowUpChannel =
  | 'email'
  | 'linkedin'
  | 'call'
  | 'whatsapp'
  | 'meeting'
  | 'instagram'
  | 'x'
  | 'tiktok'
  | 'send'
  | 'other';

export const FOLLOW_UP_CHANNELS: { id: FollowUpChannel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'call', label: 'Call' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'send', label: 'Send a file' },
  { id: 'other', label: 'Other' },
];

/**
 * "Other" stays a valid stored value (existing records use it, and the
 * server-side channel set still accepts it) but is no longer offered as a
 * new choice — picking a specific channel is what used to double as picking
 * a template, so an intentionally vague option adds confusion, not coverage.
 */
export const SELECTABLE_FOLLOW_UP_CHANNELS = FOLLOW_UP_CHANNELS.filter((channel) => channel.id !== 'other');

export function defaultFollowUpTitle(channel: FollowUpChannel) {
  switch (channel) {
    case 'email': return 'Follow up by email';
    case 'linkedin': return 'Connect on LinkedIn';
    case 'call': return 'Follow up call';
    case 'whatsapp': return 'Message on WhatsApp';
    case 'meeting': return 'Schedule a meeting';
    case 'instagram': return 'Connect on Instagram';
    case 'x': return 'Connect on X';
    case 'tiktok': return 'Connect on TikTok';
    case 'send': return 'Send the promised file';
    case 'other': return 'Complete the next step';
    default: return 'Follow up';
  }
}

function looksLikePhoneGarbage(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^\++$/.test(trimmed)) return true;
  const plusCount = (trimmed.match(/\+/g) ?? []).length;
  if (plusCount > 1 && /^[\d+\s()-]+$/.test(trimmed)) return true;
  if (/^\+[\d+]{5,}$/.test(trimmed.replace(/\s/g, ''))) return true;
  return false;
}

export function isGarbageFollowUpText(value: string) {
  return looksLikePhoneGarbage(value);
}

export function displayFollowUpTitle(title: string, channel: FollowUpChannel) {
  const trimmed = title.trim();
  if (!trimmed || looksLikePhoneGarbage(trimmed)) {
    return defaultFollowUpTitle(channel);
  }
  return trimmed;
}

export function isFollowUpChannel(value: string): value is FollowUpChannel {
  return FOLLOW_UP_CHANNELS.some((entry) => entry.id === value);
}

export function normalizeFollowUpChannels(values: string[] | undefined): FollowUpChannel[] {
  if (!Array.isArray(values)) return [];
  const next: FollowUpChannel[] = [];
  for (const value of values) {
    if (!isFollowUpChannel(value)) continue;
    if (next.includes(value)) continue;
    next.push(value);
  }
  return next;
}

export function followUpChannelsFromEncounter(actions: { channel: string }[]): FollowUpChannel[] {
  const channels: FollowUpChannel[] = [];
  for (const action of actions) {
    if (!isFollowUpChannel(action.channel)) continue;
    if (channels.includes(action.channel)) continue;
    channels.push(action.channel);
  }
  return channels;
}

export function followUpDueFromEncounter(actions: { dueAt?: string }[]) {
  return actions.find((action) => action.dueAt?.trim())?.dueAt?.trim() ?? '';
}

export function toggleFollowUpChannel(current: FollowUpChannel[], channel: FollowUpChannel): FollowUpChannel[] {
  if (current.includes(channel)) {
    return current.filter((entry) => entry !== channel);
  }
  return [...current, channel];
}

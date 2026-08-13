import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import type { FollowUpChannel } from '@/features/follow-ups/follow-up-channels';

export type FollowUpParticipant = {
  key: string;
  id?: string;
  name: string;
  email: string;
};

export type FollowUpAudienceChoice = {
  mode: 'group' | 'individual';
  participants: FollowUpParticipant[];
};

export function participantKey(name: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.includes('@')) return normalizedEmail;
  return name.trim().toLowerCase();
}

/**
 * Prefers the canonical `encounter_participants` list (carried on each
 * FollowUpItem since every action for an encounter embeds the same list).
 * Falls back to reconstructing from open actions only for encounters
 * captured before participants existed as a first-class table — that
 * fallback loses a person once their last action completes, which the
 * canonical path fixes.
 */
export function participantsForEncounter(items: FollowUpItem[], encounterId: string): FollowUpParticipant[] {
  const encounterItems = items.filter((item) => item.encounterId === encounterId);
  const canonical = encounterItems.find((item) => item.participants.length > 0)?.participants;

  if (canonical?.length) {
    return canonical
      .filter((person) => person.name.trim())
      .map((person) => ({
        key: participantKey(person.name, person.email),
        id: person.id,
        name: person.name.trim(),
        email: person.email.trim(),
      }));
  }

  const seen = new Map<string, FollowUpParticipant>();
  for (const item of encounterItems) {
    const name = item.personName.trim();
    const email = item.personEmail.trim();
    const key = participantKey(name, email);
    if (!key || seen.has(key)) continue;
    seen.set(key, { key, id: item.participantId, name: name || 'Guest', email });
  }

  return Array.from(seen.values());
}

export function encounterHasMultipleParticipants(items: FollowUpItem[], encounterId: string) {
  return participantsForEncounter(items, encounterId).length > 1;
}

export function channelSupportsGroupFollowUp(channel: FollowUpChannel) {
  return channel === 'meeting' || channel === 'email';
}

export function resolveFollowUpUserName(input: {
  activeCardName?: string;
  cards?: Array<{ name?: string; status?: string }>;
  authName?: string;
  authEmail?: string;
}) {
  const candidates: string[] = [];

  const push = (value?: string) => {
    const trimmed = value?.trim() || '';
    if (trimmed.length >= 2 && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  push(input.activeCardName);

  for (const card of input.cards ?? []) {
    if (card.status === 'published') push(card.name);
  }

  for (const card of input.cards ?? []) {
    push(card.name);
  }

  push(input.authName);

  const multiWord = candidates.find((name) => name.split(/\s+/).length >= 2);
  if (multiWord) return multiWord;

  if (candidates[0]) return candidates[0];

  const emailLocal = input.authEmail?.split('@')[0]?.replace(/[._+-]+/g, ' ').trim() || '';
  if (emailLocal.length >= 2) {
    return emailLocal
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  return 'Me';
}

/** Calendar title: "Catchup Raf Reo x Raphael Okojie" (1:1) or "Catchup Raf Reo x Person 1 x Person 2" (group). */
export function buildMeetingCalendarTitle(
  _encounterTitle: string,
  userName: string,
  participants: FollowUpParticipant[],
) {
  const others = participants
    .map((person) => person.name.trim())
    .filter((name) => name.length > 0);
  const user = userName.trim() || 'Me';
  const names = others.length ? [user, ...others].join(' x ') : user;

  return `Catchup ${names}`;
}

export function buildMeetingDetails(
  encounterTitle: string,
  participants: FollowUpParticipant[],
) {
  let details = `Scheduled from ehllo${encounterTitle.trim() ? `: ${encounterTitle.trim()}` : ''}.`;
  const emails = participants
    .map((person) => person.email.trim())
    .filter((email) => email.includes('@'));

  if (emails.length > 1) {
    details += `\n\nAttendees:\n${emails.join('\n')}`;
  }

  return details;
}

export function participantEmails(participants: FollowUpParticipant[]) {
  return participants
    .map((person) => person.email.trim())
    .filter((email) => email.includes('@'));
}

export function primaryParticipantLabel(participants: FollowUpParticipant[]) {
  if (participants.length === 1) return participants[0]?.name.trim() || 'Contact';
  if (participants.length > 1) {
    return participants.map((person) => person.name.trim() || 'Guest').join(', ');
  }
  return 'Contact';
}

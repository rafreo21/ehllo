import type { EncounterAction } from '@/features/encounters/encounter-api';
import {
  isFollowUpChannel,
  isGarbageFollowUpText,
} from '@/features/follow-ups/follow-up-channels';
import type { ContactMethod, ContactMethodType } from '@/features/card/types';
import { METHOD_META } from '@/features/card/method-meta';
import { contactMethodHref } from '@/lib/contact-methods';

export type MissingMethodType = ContactMethodType | 'preferred_contact';

export function channelToMethodType(channel: EncounterAction['channel']): MissingMethodType {
  switch (channel) {
    case 'call': return 'phone';
    case 'linkedin': return 'linkedin';
    case 'whatsapp': return 'whatsapp';
    case 'email': return 'email';
    case 'instagram': return 'instagram';
    case 'x': return 'x';
    case 'tiktok': return 'tiktok';
    case 'meeting': return 'calendly';
    case 'send': return 'email';
    default: return 'preferred_contact';
  }
}

export function methodDisplayName(type: MissingMethodType) {
  if (type === 'preferred_contact') return 'preferred contact method';
  return METHOD_META[type]?.name || type;
}

export function methodRequestLabel(type: MissingMethodType) {
  if (type === 'preferred_contact') return 'a way to reach you';
  if (type === 'email') return 'email address';
  if (type === 'phone') return 'phone number';
  return METHOD_META[type]?.name || type;
}

export function findCardMethod(methods: ContactMethod[], type: ContactMethodType) {
  return methods.find((method) => method.type === type && method.value.trim()) || null;
}

export function resolveMethodHref(methods: ContactMethod[], type: ContactMethodType, fallbacks?: Partial<Record<'phone' | 'email', string>>) {
  const fromCard = findCardMethod(methods, type);
  if (fromCard) {
    const href = contactMethodHref(fromCard);
    if (href) return href;
  }

  if (type === 'phone' && fallbacks?.phone?.trim()) {
    const href = contactMethodHref({ type: 'phone', value: fallbacks.phone });
    if (href) return href;
  }

  if (type === 'whatsapp' && fallbacks?.phone?.trim()) {
    const href = contactMethodHref({ type: 'whatsapp', value: fallbacks.phone });
    if (href) return href;
  }

  if (type === 'email' && fallbacks?.email?.trim()) {
    const href = contactMethodHref({ type: 'email', value: fallbacks.email });
    if (href) return href;
  }

  return null;
}

/** A natural "I wanted to ___" phrase for the default (untitled) follow-up on this channel. */
function followUpActionPhrase(channel: EncounterAction['channel']) {
  switch (channel) {
    case 'email': return 'follow up by email';
    case 'linkedin': return 'connect on LinkedIn';
    case 'call': return 'follow up on our call';
    case 'whatsapp': return 'message you on WhatsApp';
    case 'meeting': return 'schedule a meeting';
    case 'instagram': return 'connect on Instagram';
    case 'x': return 'connect on X';
    case 'tiktok': return 'connect on TikTok';
    case 'send': return 'send the promised file';
    default: return 'follow up on next steps';
  }
}

export function buildTailoredRequestEmail(input: {
  personName: string;
  methodType: MissingMethodType;
  followUpTitle?: string;
  followUpChannel?: string;
  /** The linked event's title, if any - event is an activator: omit it and the opener is unchanged. */
  eventTitle?: string;
}) {
  const greeting = input.personName.trim()
    ? `Hey ${input.personName.split(' ')[0]},`
    : 'Hey there,';
  const trimmedTitle = input.followUpTitle?.trim();
  const hasCustomTitle = Boolean(trimmedTitle) && !isGarbageFollowUpText(trimmedTitle!);
  const followUp = hasCustomTitle
    ? `\n\nI wanted to follow up on ${trimmedTitle}.`
    : input.followUpChannel && isFollowUpChannel(input.followUpChannel)
      ? `\n\nI wanted to ${followUpActionPhrase(input.followUpChannel)}.`
      : '';
  const methodLabel = methodRequestLabel(input.methodType);
  const eventTitle = input.eventTitle?.trim();
  const opener = eventTitle ? `It was great meeting you at ${eventTitle}.` : 'It was great meeting you.';

  if (input.methodType === 'preferred_contact') {
    return `${greeting}\n\n${opener}${followUp}\n\nCould you share the best way to reach you on your ehllo card?\n\nThanks!`;
  }

  return `${greeting}\n\n${opener}${followUp}\n\nCould you add your ${methodLabel} to your ehllo card so I can connect with you more easily?\n\nThanks!`;
}

export function requestEmailSubject(methodType: MissingMethodType) {
  if (methodType === 'preferred_contact') return 'Best way to stay in touch';
  return `Could you add your ${methodRequestLabel(methodType)}?`;
}

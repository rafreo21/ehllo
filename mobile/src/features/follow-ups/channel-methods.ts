import type { EncounterAction } from '@/features/encounters/encounter-api';
import {
  displayFollowUpTitle,
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

export function buildTailoredRequestEmail(input: {
  personName: string;
  methodType: MissingMethodType;
  followUpTitle?: string;
  followUpChannel?: string;
  /** The linked event's title, if any — event is an activator: omit it and the opener is unchanged. */
  eventTitle?: string;
}) {
  const greeting = input.personName.trim()
    ? `Hey ${input.personName.split(' ')[0]},`
    : 'Hey there,';
  const cleanedFollowUp = input.followUpTitle?.trim()
    && !isGarbageFollowUpText(input.followUpTitle)
    && input.followUpChannel
    && isFollowUpChannel(input.followUpChannel)
    ? displayFollowUpTitle(input.followUpTitle, input.followUpChannel)
    : '';
  const followUp = cleanedFollowUp
    ? `\n\nI wanted to follow up on ${cleanedFollowUp}.`
    : '';
  const methodLabel = methodRequestLabel(input.methodType);
  const eventTitle = input.eventTitle?.trim();
  const opener = eventTitle ? `It was great meeting you at ${eventTitle}.` : 'It was great meeting you.';

  if (input.methodType === 'preferred_contact') {
    return `${greeting}\n\n${opener}${followUp}\n\nCould you share the best way to reach you on your AfterMeet card?\n\nThanks!`;
  }

  return `${greeting}\n\n${opener}${followUp}\n\nCould you add your ${methodLabel} to your AfterMeet card so I can connect with you more easily?\n\nThanks!`;
}

export function requestEmailSubject(methodType: MissingMethodType) {
  if (methodType === 'preferred_contact') return 'Best way to stay in touch';
  return `Could you add your ${methodRequestLabel(methodType)}?`;
}

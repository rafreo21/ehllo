import { Linking, Platform } from 'react-native';

import type { EncounterAction } from '@/features/encounters/encounter-api';
import type { ContactMethod } from '@/features/card/types';
import { contactActionCandidates } from '@/features/card/contact-actions';
import {
  channelToMethodType,
  findCardMethod,
  methodDisplayName,
  type MissingMethodType,
} from '@/features/follow-ups/channel-methods';
import { contactMethodHref } from '@/lib/contact-methods';
import { buildMailtoQuery } from '@/lib/email-compose';
import { openUrlCandidates } from '@/lib/open-url-candidates';
import {
  buildMeetingCalendarTitle,
  buildMeetingDetails,
  participantEmails,
  primaryParticipantLabel,
  type FollowUpParticipant,
} from '@/features/follow-ups/follow-up-participants';

export type ActionContactContext = {
  personName: string;
  personEmail: string;
  phone?: string;
  methods?: ContactMethod[];
  encounterTitle?: string;
  calendarProvider?: 'google' | 'microsoft' | null;
  userName?: string;
  audienceParticipants?: FollowUpParticipant[];
  audienceMode?: 'group' | 'individual';
  /** The linked event's title, if any — event is an activator: when unset, the email opener is unchanged. */
  eventTitle?: string;
};

export type ResolvedAction = {
  href: string;
  candidates?: string[];
  label: string;
  external: boolean;
  unavailableReason?: string;
  missingMethod?: MissingMethodType;
  meetingCompose?: MeetingComposeContext;
  calendarProvider?: 'google' | 'microsoft' | null;
};

export type MeetingComposeContext = {
  title: string;
  details: string;
  dueAt: string;
  attendeeEmail?: string;
  attendeeEmails?: string[];
};

function meetingWindow(dueAt: string) {
  const start = dueAt ? new Date(`${dueAt.slice(0, 10)}T10:00:00`) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start, end };
}

function formatGoogleCalendarDates(start: Date, end: Date) {
  return `${start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}/${end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
}

function androidIntentForWebUrl(webUrl: string, packageName: string) {
  return `intent://${webUrl.replace(/^https:\/\//, '')}#Intent;scheme=https;package=${packageName};end`;
}

function androidCalendarInsertIntent(title: string, details: string, start: Date, end: Date) {
  return [
    'intent:#Intent',
    'action=android.intent.action.INSERT',
    'type=vnd.android.cursor.item/event',
    `S.title=${encodeURIComponent(title)}`,
    `S.description=${encodeURIComponent(details)}`,
    `S.beginTime=${start.getTime()}`,
    `S.endTime=${end.getTime()}`,
    'end',
  ].join(';');
}

function outlookNativeCalendarLink(
  title: string,
  details: string,
  start: Date,
  end: Date,
  attendeeEmails: string[] = [],
) {
  const params = new URLSearchParams({
    title,
    body: details,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });
  const joined = attendeeEmails.filter((email) => email.includes('@')).join(';');
  if (joined) {
    params.set('to', joined);
  }
  return `ms-outlook://events/new?${params.toString()}`;
}

function googleCalendarAppLink(title: string, details: string, start: Date, end: Date, attendeeEmails: string[] = []) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details,
    dates: formatGoogleCalendarDates(start, end),
  });
  for (const email of attendeeEmails) {
    if (email.includes('@')) params.append('add', email.trim());
  }
  return `comgooglecalendar://create?${params.toString()}`;
}

export function meetingActionCandidates(
  title: string,
  details: string,
  dueAt: string,
  attendeeEmails: string[] = [],
  calendarProvider?: 'google' | 'microsoft' | null,
): string[] {
  const { start, end } = meetingWindow(dueAt);
  const webGoogle = googleCalendarLink(title, details, dueAt, attendeeEmails);
  const webOutlook = outlookCalendarLink(title, details, dueAt, attendeeEmails);
  const outlookNative = outlookNativeCalendarLink(title, details, start, end, attendeeEmails);
  const googleNative = googleCalendarAppLink(title, details, start, end, attendeeEmails);
  const hasAttendees = attendeeEmails.some((email) => email.includes('@'));

  const native: string[] = [];
  const web: string[] = [];

  // Android's generic "insert event" intent has no documented extra for
  // guests, so it can never carry attendee emails. Keep it as the first,
  // fastest candidate when there's nobody to prefill, but deprioritize it
  // below the attendee-aware candidates whenever there are guests to add.
  if (Platform.OS === 'android' && !hasAttendees) {
    native.push(androidCalendarInsertIntent(title, details, start, end));
  }

  if (calendarProvider === 'microsoft') {
    native.push(outlookNative);
    if (Platform.OS === 'android') {
      native.push(androidIntentForWebUrl(webOutlook, 'com.microsoft.office.outlook'));
    }
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      native.push(googleNative);
    }
    web.push(webOutlook, webGoogle);
  } else {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      native.push(googleNative);
    }
    if (Platform.OS === 'android') {
      native.push(androidIntentForWebUrl(webGoogle, 'com.google.android.calendar'));
    }
    native.push(outlookNative);
    if (Platform.OS === 'android') {
      native.push(androidIntentForWebUrl(webOutlook, 'com.microsoft.office.outlook'));
    }
    web.push(webGoogle, webOutlook);
  }

  if (Platform.OS === 'android' && hasAttendees) {
    native.push(androidCalendarInsertIntent(title, details, start, end));
  }

  return [...new Set([...native, ...web].filter(Boolean))];
}

/** Opens the native calendar composer first; falls back to app/deep links, then web. */
export async function openMeetingCompose(
  compose: MeetingComposeContext,
  calendarProvider?: 'google' | 'microsoft' | null,
): Promise<boolean> {
  const { start, end } = meetingWindow(compose.dueAt);
  const attendeeEmails = compose.attendeeEmails?.length
    ? compose.attendeeEmails
    : compose.attendeeEmail?.includes('@')
      ? [compose.attendeeEmail.trim()]
      : [];

  // The system's generic "insert event" intent can't carry attendee emails,
  // so only take this fast path when there's nobody to prefill as a guest —
  // otherwise fall through to meetingActionCandidates, which knows how to
  // reach attendee-aware candidates first.
  if (Platform.OS === 'android' && attendeeEmails.length === 0) {
    try {
      await Linking.openURL(androidCalendarInsertIntent(compose.title, compose.details, start, end));
      return true;
    } catch {
      // Fall through to URL candidates.
    }
  }

  const candidates = meetingActionCandidates(
    compose.title,
    compose.details,
    compose.dueAt,
    attendeeEmails,
    calendarProvider,
  );
  return openUrlCandidates(candidates);
}

function methodActionCandidates(method: ContactMethod): string[] {
  return contactActionCandidates(method);
}

function googleCalendarLink(title: string, details: string, dueAt: string, attendeeEmails: string[] = []) {
  const { start, end } = meetingWindow(dueAt);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details,
    dates: formatGoogleCalendarDates(start, end),
  });
  for (const email of attendeeEmails) {
    if (email.includes('@')) params.append('add', email.trim());
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookCalendarLink(title: string, details: string, dueAt: string, attendeeEmails: string[] = []) {
  const { start, end } = meetingWindow(dueAt);
  const params = new URLSearchParams({
    subject: title,
    body: details,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    path: '/calendar/action/compose',
    rru: 'addevent',
  });
  const joined = attendeeEmails.filter((email) => email.includes('@')).join(';');
  if (joined) {
    params.set('to', joined);
  }
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function channelLabel(channel: EncounterAction['channel']) {
  switch (channel) {
    case 'call': return 'Call';
    case 'linkedin': return 'LinkedIn';
    case 'email': return 'Email';
    case 'meeting': return 'Meeting';
    case 'send': return 'Send';
    case 'whatsapp': return 'WhatsApp';
    case 'instagram': return 'Instagram';
    case 'x': return 'X';
    case 'tiktok': return 'TikTok';
    default: return 'Follow-up';
  }
}

/** eventTitle is an activator: omit it and the opener reads exactly as before. */
function meetingOpener(eventTitle?: string) {
  const trimmed = eventTitle?.trim();
  return trimmed ? `It was great meeting you at ${trimmed}.` : 'It was great meeting you.';
}

export function buildFollowUpEmailBody(personName: string, eventTitle?: string) {
  const greeting = personName.trim()
    ? `Hey ${personName.split(' ')[0]},`
    : 'Hey there,';
  return `${greeting}\n\n${meetingOpener(eventTitle)} I'd love to stay in touch.\n\nThanks!`;
}

export function buildFollowUpMailto(email: string, personName: string, eventTitle?: string) {
  return buildFollowUpMailtoMany([email], [personName], eventTitle);
}

export function buildFollowUpMailtoMany(emails: string[], personNames: string[], eventTitle?: string) {
  const addresses = emails
    .map((email) => email.trim())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (!addresses.length) return null;

  const names = personNames.map((name) => name.trim()).filter(Boolean);
  const greeting = names.length > 1
    ? 'Hey all,'
    : names[0]
      ? `Hey ${names[0].split(' ')[0]},`
      : 'Hey there,';
  const body = `${greeting}\n\n${meetingOpener(eventTitle)} I'd love to stay in touch.\n\nThanks!`;
  const query = buildMailtoQuery({
    subject: names.length > 1 ? 'Great meeting everyone' : 'Great meeting you',
    body,
  });
  const joined = addresses.map((address) => encodeURIComponent(address)).join(',');
  return query ? `mailto:${joined}?${query}` : `mailto:${joined}`;
}

export function resolveFollowUpAction(
  action: Pick<EncounterAction, 'channel' | 'title' | 'dueAt'>,
  context: ActionContactContext,
): ResolvedAction {
  const methods = context.methods ?? [];
  const fallbacks = {
    phone: context.phone,
    email: context.personEmail,
  };
  const methodType = channelToMethodType(action.channel);
  const person = context.personName.trim() || 'This person';
  const methodName = methodDisplayName(methodType);

  if (action.channel === 'meeting') {
    const audience: FollowUpParticipant[] = context.audienceParticipants?.length
      ? context.audienceParticipants
      : [{
        key: context.personEmail.trim().toLowerCase() || context.personName.trim().toLowerCase() || 'contact',
        name: context.personName,
        email: context.personEmail,
      }];
    const attendeeEmails = participantEmails(audience);
    const title = buildMeetingCalendarTitle(
      context.encounterTitle || '',
      context.userName || 'Me',
      audience,
    );
    const details = buildMeetingDetails(context.encounterTitle || '', audience);
    const meetingCompose: MeetingComposeContext = {
      title,
      details,
      dueAt: action.dueAt,
      attendeeEmail: attendeeEmails[0],
      attendeeEmails,
    };
    const candidates = meetingActionCandidates(
      title,
      details,
      action.dueAt,
      attendeeEmails,
      context.calendarProvider,
    );
    return {
      href: candidates[0] || '',
      candidates,
      meetingCompose,
      calendarProvider: context.calendarProvider,
      label: 'Schedule meeting',
      external: true,
    };
  }

  if (methodType === 'preferred_contact') {
    const methodWithHref = methods.find((method) => contactActionCandidates(method).length);
    if (methodWithHref) {
      const candidates = methodActionCandidates(methodWithHref);
      return {
        href: candidates[candidates.length - 1] || contactMethodHref(methodWithHref) || '',
        candidates,
        label: 'Open contact',
        external: true,
      };
    }
    return {
      href: '',
      label: 'Contact',
      external: false,
      unavailableReason: `${person} hasn't shared a contact method on their card yet.`,
      missingMethod: 'preferred_contact',
    };
  }

  if (action.channel === 'email') {
    const audience: FollowUpParticipant[] = context.audienceParticipants?.length
      ? context.audienceParticipants
      : [{
        key: context.personEmail.trim().toLowerCase() || context.personName.trim().toLowerCase() || 'contact',
        name: context.personName,
        email: context.personEmail,
      }];
    const cardEmail = findCardMethod(methods, 'email')?.value.trim()
      || audience.find((entry) => entry.email.includes('@'))?.email.trim()
      || fallbacks.email?.trim()
      || '';
    const cardEmails = audience
      .map((entry) => entry.email.trim())
      .filter((email) => email.includes('@'));
    const mailto = cardEmails.length > 1
      ? buildFollowUpMailtoMany(cardEmails, audience.map((entry) => entry.name), context.eventTitle)
      : cardEmail
        ? buildFollowUpMailto(cardEmail, primaryParticipantLabel(audience), context.eventTitle)
        : null;
    if (mailto) {
      return { href: mailto, label: 'Email', external: true };
    }
  }

  const concreteType = methodType as ContactMethod['type'];
  const cardMethod = findCardMethod(methods, concreteType);
  const fallbackValue = concreteType === 'phone' || concreteType === 'whatsapp'
    ? fallbacks.phone
    : concreteType === 'email'
      ? fallbacks.email
      : undefined;
  const resolvedMethod: ContactMethod | null = cardMethod
    || (fallbackValue?.trim() ? { id: 'fallback', type: concreteType, value: fallbackValue, label: methodName } : null);

  if (resolvedMethod) {
    const candidates = methodActionCandidates(resolvedMethod);
    const href = candidates[candidates.length - 1] || contactMethodHref(resolvedMethod) || '';
    if (href || candidates.length) {
      return {
        href,
        candidates,
        label: channelLabel(action.channel),
        external: href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:'),
      };
    }
  }

  return {
    href: '',
    label: channelLabel(action.channel),
    external: false,
    unavailableReason: `${person} hasn't added ${methodName} on their card yet.`,
    missingMethod: methodType,
  };
}

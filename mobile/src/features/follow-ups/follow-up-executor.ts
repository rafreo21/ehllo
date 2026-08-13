import { openExternalHref } from '@/features/card/contact-actions';
import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import { requestContactField } from '@/features/follow-ups/follow-up-api';
import {
  openMeetingCompose,
  resolveFollowUpAction,
  type ActionContactContext,
  type MeetingComposeContext,
} from '@/features/follow-ups/action-links';
import {
  buildTailoredRequestEmail,
  requestEmailSubject,
  type MissingMethodType,
} from '@/features/follow-ups/channel-methods';
import type { FollowUpAudienceChoice } from '@/features/follow-ups/follow-up-participants';
import { primaryParticipantLabel } from '@/features/follow-ups/follow-up-participants';
import { openEmailCompose } from '@/lib/email-compose';
import type { MobileCard } from '@/features/card/types';
import type { ConnectionItem } from '@/features/connections/connections-api';

export function contactContextFromCard(
  connection: Pick<ConnectionItem, 'name' | 'email' | 'phone'>,
  card: MobileCard | null,
): ActionContactContext {
  const methods = card?.methods ?? [];
  const phone = connection.phone?.trim()
    || methods.find((method) => method.type === 'phone')?.value?.trim()
    || '';

  return {
    personName: connection.name,
    personEmail: connection.email?.trim()
      || methods.find((method) => method.type === 'email')?.value?.trim()
      || '',
    phone,
    methods,
  };
}

export function contactContextFromFollowUp(item: FollowUpItem): ActionContactContext {
  const methods = item.contactMethods ?? [];
  return {
    personName: item.personName,
    personEmail: item.personEmail.trim()
      || methods.find((method) => method.type === 'email')?.value?.trim()
      || '',
    phone: methods.find((method) => method.type === 'phone')?.value?.trim()
      || methods.find((method) => method.type === 'whatsapp')?.value?.trim()
      || '',
    methods,
    encounterTitle: item.encounterTitle,
    eventTitle: item.eventTitle,
  };
}

export function applyAudienceToContext(
  context: ActionContactContext,
  audience: FollowUpAudienceChoice,
  userName: string,
): ActionContactContext {
  return {
    ...context,
    userName,
    audienceMode: audience.mode,
    audienceParticipants: audience.participants,
    personName: primaryParticipantLabel(audience.participants),
    personEmail: audience.participants.find((person) => person.email.includes('@'))?.email || context.personEmail,
  };
}

export type FollowUpExecution =
  | {
      type: 'open';
      href: string;
      candidates?: string[];
      external: boolean;
      meetingCompose?: MeetingComposeContext;
      calendarProvider?: 'google' | 'microsoft' | null;
    }
  | {
      type: 'request';
      item: FollowUpItem;
      methodType: MissingMethodType;
      message: string;
      recipientEmail: string;
      emailSubject: string;
      tailoredEmailBody: string;
      preferredContactEmailBody: string;
    }
  | {
      type: 'manual';
      message: string;
      recipientEmail?: string;
      emailSubject?: string;
      tailoredEmailBody?: string;
      preferredContactEmailBody?: string;
    };

export function planFollowUpExecution(
  item: FollowUpItem,
  context: ActionContactContext,
): FollowUpExecution {
  const action = resolveFollowUpAction(
    { channel: item.channel, title: item.title, dueAt: item.dueAt },
    { ...context, encounterTitle: item.encounterTitle, eventTitle: item.eventTitle },
  );

  if (action.href && !action.missingMethod) {
    return {
      type: 'open',
      href: action.href,
      candidates: action.candidates,
      external: action.external,
      meetingCompose: action.meetingCompose,
      calendarProvider: action.calendarProvider,
    };
  }

  const methodType = action.missingMethod || 'preferred_contact';
  const message = action.unavailableReason
    || `${context.personName || 'This person'} hasn't added that contact method yet.`;
  const recipientEmail = context.personEmail.trim();
  const emailSubject = requestEmailSubject(methodType);
  const tailoredEmailBody = buildTailoredRequestEmail({
    personName: context.personName,
    methodType,
    followUpTitle: item.title,
    followUpChannel: item.channel,
    eventTitle: item.eventTitle,
  });
  const preferredContactEmailBody = buildTailoredRequestEmail({
    personName: context.personName,
    methodType: 'preferred_contact',
    followUpTitle: item.title,
    followUpChannel: item.channel,
    eventTitle: item.eventTitle,
  });

  if (recipientEmail.includes('@')) {
    return {
      type: 'request',
      item,
      methodType,
      message,
      recipientEmail,
      emailSubject,
      tailoredEmailBody,
      preferredContactEmailBody,
    };
  }

  return {
    type: 'manual',
    message: `${message} We don't have their email yet, so you'll need to reach out another way.`,
  };
}

export async function openFollowUpExecution(execution: FollowUpExecution) {
  if (execution.type !== 'open') return;
  if (execution.meetingCompose) {
    const opened = await openMeetingCompose(execution.meetingCompose, execution.calendarProvider);
    if (opened) return;
  }
  await openExternalHref(execution.href, execution.candidates);
}

export async function sendContactFieldRequest(
  accessToken: string,
  execution: Extract<FollowUpExecution, { type: 'request' }>,
) {
  await requestContactField(accessToken, {
    targetEmail: execution.recipientEmail,
    targetExchangeId: execution.item.exchangeId,
    fieldType: execution.methodType,
    channel: execution.item.channel,
    followUpTitle: execution.item.title,
    encounterId: execution.item.encounterId,
    actionId: execution.item.actionId,
  });
}

export async function openRequestEmail(
  execution: Extract<FollowUpExecution, { type: 'request' | 'manual' }>,
) {
  const recipientEmail = execution.recipientEmail?.trim() || '';
  const body = execution.tailoredEmailBody;
  const subject = execution.emailSubject || requestEmailSubject('preferred_contact');

  if (!recipientEmail.includes('@') || !body) return;

  await openEmailCompose({
    to: recipientEmail,
    subject,
    body,
  });
}

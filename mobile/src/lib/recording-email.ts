import { CLOUD_RECORDING_RETENTION_DAYS } from './recording-metadata';

export type RecordingShareEmailInput = {
  title: string;
  personName: string;
  personEmail?: string;
  guestUrl: string;
  sharedSummary?: string;
  meetingDate?: string;
  cloudExpired?: boolean;
};

export function buildRecordingShareEmail(input: RecordingShareEmailInput) {
  const greetingName = input.personName.trim().split(/\s+/)[0] || 'there';
  const subject = `Meeting recording: ${input.title.trim() || 'ehllo capture'}`;
  const lines = [
    `Hi ${greetingName},`,
    '',
    input.cloudExpired
      ? "The shared online recording is no longer available, so I'm sending the audio from my device."
      : `Here is our meeting record from ehllo. The online recording is available for ${CLOUD_RECORDING_RETENTION_DAYS} days at the guest link below.`,
    '',
    `Meeting: ${input.title.trim() || 'Untitled meeting'}`,
    input.personName.trim() ? `With: ${input.personName.trim()}` : '',
    input.meetingDate ? `Date: ${input.meetingDate}` : '',
    '',
    input.sharedSummary?.trim() ? `What we agreed:\n${input.sharedSummary.trim()}` : '',
    '',
    `Guest link (summary + your next steps): ${input.guestUrl}`,
    '',
    'Please attach the meeting recording file before sending if your email app did not attach it automatically.',
    '',
    'Sent via ehllo',
  ].filter((line) => line !== '');

  return {
    to: input.personEmail?.trim() ?? '',
    subject,
    body: lines.join('\n'),
  };
}

export function formatMeetingEmailDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

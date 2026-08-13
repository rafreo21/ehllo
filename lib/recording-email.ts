import { CLOUD_RECORDING_RETENTION_DAYS } from "./recording-metadata.ts";

export type RecordingShareEmailInput = {
  title: string;
  personName: string;
  personEmail?: string;
  guestUrl: string;
  sharedSummary?: string;
  meetingDate?: string;
  /** Cloud copy no longer available — host sends from device. */
  cloudExpired?: boolean;
};

export function buildRecordingShareEmail(input: RecordingShareEmailInput) {
  const greetingName = input.personName.trim().split(/\s+/)[0] || "there";
  const subject = `Meeting recording: ${input.title.trim() || "Ehllo capture"}`;
  const lines = [
    `Hi ${greetingName},`,
    "",
    input.cloudExpired
      ? "The shared online recording is no longer available, so I'm sending the audio from my device."
      : `Here is our meeting record from Ehllo. The online recording is available for ${CLOUD_RECORDING_RETENTION_DAYS} days at the guest link below.`,
    "",
    `Meeting: ${input.title.trim() || "Untitled meeting"}`,
    input.personName.trim() ? `With: ${input.personName.trim()}` : "",
    input.meetingDate ? `Date: ${input.meetingDate}` : "",
    "",
    input.sharedSummary?.trim() ? `What we agreed:\n${input.sharedSummary.trim()}` : "",
    "",
    `Guest link (summary + your next steps): ${input.guestUrl}`,
    "",
    "Please attach the meeting recording file before sending if your email app did not attach it automatically.",
    "",
    "— Sent via Ehllo",
  ].filter((line) => line !== "");

  return {
    to: input.personEmail?.trim() ?? "",
    subject,
    body: lines.join("\n"),
  };
}

export function recordingShareMailtoHref(input: RecordingShareEmailInput) {
  const email = buildRecordingShareEmail(input);
  const params = new URLSearchParams();
  if (email.subject) params.set("subject", email.subject);
  if (email.body) params.set("body", email.body);
  const query = params.toString();
  if (email.to) {
    return `mailto:${encodeURIComponent(email.to)}${query ? `?${query}` : ""}`;
  }
  return `mailto:${query ? `?${query}` : ""}`;
}

export function formatMeetingEmailDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

import type { Encounter } from "./encounters";

export type FollowUpChannel = Encounter["actions"][number]["channel"];

export const FOLLOW_UP_CHANNELS: Array<{ id: FollowUpChannel; label: string }> = [
  { id: "email", label: "Email" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "call", label: "Call" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "meeting", label: "Meeting" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "tiktok", label: "TikTok" },
  { id: "send", label: "Send a file" },
  { id: "other", label: "Other" },
];

// "Other" stays a valid stored value (existing records use it) but isn't
// offered as a new choice - picking a specific channel is what now doubles
// as picking a template, so an intentionally vague option adds confusion,
// not coverage.
export const SELECTABLE_FOLLOW_UP_CHANNELS = FOLLOW_UP_CHANNELS.filter((channel) => channel.id !== "other");

export function defaultFollowUpTitle(channel: FollowUpChannel) {
  switch (channel) {
    case "email": return "Follow up by email";
    case "linkedin": return "Connect on LinkedIn";
    case "call": return "Follow up call";
    case "whatsapp": return "Message on WhatsApp";
    case "meeting": return "Schedule a meeting";
    case "instagram": return "Connect on Instagram";
    case "x": return "Connect on X";
    case "tiktok": return "Connect on TikTok";
    case "send": return "Send the promised file";
    case "other": return "Complete the next step";
    default: return "Follow up";
  }
}

function looksLikePhoneGarbage(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^\++$/.test(trimmed)) return true;
  const plusCount = (trimmed.match(/\+/g) ?? []).length;
  if (plusCount > 1 && /^[\d+\s()-]+$/.test(trimmed)) return true;
  if (/^\+[\d+]{5,}$/.test(trimmed.replace(/\s/g, ""))) return true;
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

import type { ActionLinkContext } from "./action-links";
import type { Encounter, EncounterAction } from "./encounters";

export type OutboundDraftContent = {
  subject: string;
  body: string;
};

export function firstNameFromContext(context: ActionLinkContext) {
  return context.personName.trim().split(/\s+/)[0] || "there";
}

export function buildHeuristicOutboundDraft(
  action: Pick<EncounterAction, "title" | "channel">,
  encounter: Pick<Encounter, "title" | "sharedSummary" | "privateNotes">,
  context: ActionLinkContext,
): OutboundDraftContent {
  const firstName = firstNameFromContext(context);
  const subject = encounter.title
    ? `Following up: ${encounter.title}`
    : `Following up from our conversation`;

  if (action.channel === "linkedin") {
    return {
      subject: "",
      body: [
        `Hi ${firstName},`,
        "",
        encounter.sharedSummary ? `Good to connect - ${encounter.sharedSummary}` : "Good to connect.",
        "",
        action.title,
        "",
        "Best,",
      ].join("\n"),
    };
  }

  const summaryLine = encounter.sharedSummary
    ? `Good to meet you. ${encounter.sharedSummary}`
    : "Good to meet you - thanks for the conversation.";

  return {
    subject,
    body: [
      `Hi ${firstName},`,
      "",
      summaryLine,
      "",
      action.title,
      "",
      "Best,",
    ].join("\n"),
  };
}

export function gmailComposeLink(to: string, subject: string, body: string) {
  const params = new URLSearchParams({ view: "cm", fs: "1" });
  if (to) params.set("to", to);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function outlookComposeLink(to: string, subject: string, body: string) {
  const params = new URLSearchParams();
  if (to) params.set("to", to);
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
}

export function mailtoComposeLink(to: string, subject: string, body: string) {
  const parts: string[] = [];
  if (subject.trim()) parts.push(`subject=${encodeURIComponent(subject.trim())}`);
  if (body.trim()) parts.push(`body=${encodeURIComponent(body.trim())}`);
  const query = parts.join("&");
  if (to) return `mailto:${encodeURIComponent(to.trim())}${query ? `?${query}` : ""}`;
  return `mailto:${query ? `?${query}` : ""}`;
}

export function composeLinksForDraft(
  action: Pick<EncounterAction, "channel">,
  draft: OutboundDraftContent,
  context: ActionLinkContext,
) {
  if (action.channel === "linkedin") {
    return [];
  }
  const to = context.personEmail;
  return [
    { label: "Open in Gmail", href: gmailComposeLink(to, draft.subject, draft.body), external: true },
    { label: "Open in Outlook", href: outlookComposeLink(to, draft.subject, draft.body), external: true },
    { label: "Mail app", href: mailtoComposeLink(to, draft.subject, draft.body), external: false },
  ];
}

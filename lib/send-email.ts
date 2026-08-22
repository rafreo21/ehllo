import "server-only";

import { htmlToPlainText } from "./email-plain-text";

/**
 * Every message carries a plain-text alternative as well as the HTML.
 *
 * It used to post `html` alone. A message with no text/plain part is a long-standing spam
 * signal, and with our DMARC policy set to quarantine there is no margin to spend on
 * avoidable ones. The activity log recorded this as fixed on the 18th while it was still
 * true, which is worse than not having fixed it - it stopped anyone looking.
 *
 * `text` can be passed when a template has a better plain version than its own markup
 * flattened; nothing does yet, and deriving it means the two can never drift.
 */
export async function sendEmail(input: { to: string; subject: string; html: string; text?: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "ehllo <onboarding@resend.dev>";
  if (!apiKey) return { ok: false as const, error: "Resend is not configured." };

  const text = input.text?.trim() || htmlToPlainText(input.html);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      // Omitted when the HTML flattens to nothing, rather than sending an empty part -
      // an empty text/plain reads worse to a filter than none at all.
      ...(text ? { text } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Resend send failed", response.status, error);
    return { ok: false as const, error };
  }

  return { ok: true as const };
}

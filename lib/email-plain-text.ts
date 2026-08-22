/**
 * A plain-text alternative for an HTML email.
 *
 * A message with no text/plain part is a long-standing spam signal, and the activity log
 * has claimed since the 18th that our mail carries one. It does not: sendEmail posted only
 * `html` to Resend. So one of the two named causes of sign-in codes and reminders landing
 * in junk was recorded as fixed while still being true.
 *
 * Derived from the HTML rather than written twice. Two hand-maintained copies of the same
 * message drift, and the version nobody looks at is always the stale one - and the text
 * part is exactly the version nobody looks at.
 */

/** The handful of entities our templates actually produce. */
const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&amp;/gi, "&"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
  [/&mdash;/gi, "-"],
  [/&ndash;/gi, "-"],
  [/&hellip;/gi, "..."],
];

export function htmlToPlainText(html: string): string {
  let text = html;

  // Dropped whole, content and all. Leaving the contents behind would put stylesheet rules
  // and script bodies into the readable part of the message.
  text = text.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // A link's destination is the useful part of it in plain text. "Open ehllo" with nowhere
  // to go is worse than no text part at all.
  text = text.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const cleanHref = href.trim();
      if (!cleanLabel) return cleanHref;
      // Bare mailto and identical label/href would otherwise read as "x@y.com (x@y.com)".
      if (cleanHref === cleanLabel || cleanHref === `mailto:${cleanLabel}`) return cleanLabel;
      return `${cleanLabel} (${cleanHref})`;
    },
  );

  // Structure that means a line break to a reader becomes one.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|h[1-6]|section|header|footer|table)\s*>/gi, "\n\n");
  text = text.replace(/<li\b[^>]*>/gi, "\n- ");
  text = text.replace(/<\/(ul|ol)\s*>/gi, "\n\n");

  text = text.replace(/<[^>]+>/g, " ");
  for (const [pattern, replacement] of ENTITIES) text = text.replace(pattern, replacement);
  // Numeric entities after the named ones, so &#38; does not become & and get re-read.
  text = text.replace(/&#(\d+);/g, (_match, code: string) => {
    const point = Number.parseInt(code, 10);
    return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : " ";
  });

  // Whitespace last, so the line breaks introduced above survive the collapse.
  text = text.replace(/[ \t\f\v ]+/g, " ");
  text = text.replace(/ *\n */g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

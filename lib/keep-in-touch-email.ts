function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type KeepInTouchThreshold = 1 | 3 | 7 | 30;

const THRESHOLD_COPY: Record<KeepInTouchThreshold, { title: (name: string) => string; timeframe: string }> = {
  1: { title: (name) => `Follow up with ${name}?`, timeframe: "yesterday" },
  3: { title: (name) => `Still want to reach out to ${name}?`, timeframe: "3 days ago" },
  7: { title: (name) => `It's been a week since you met ${name}`, timeframe: "a week ago" },
  30: { title: (name) => `Don't lose touch with ${name}`, timeframe: "a month ago" },
};

export function keepInTouchTitle(threshold: KeepInTouchThreshold, personName: string) {
  return THRESHOLD_COPY[threshold].title(personName.trim() || "them");
}

export function keepInTouchBody(threshold: KeepInTouchThreshold, personName: string) {
  const name = personName.trim() || "them";
  return `You connected with ${name} ${THRESHOLD_COPY[threshold].timeframe} - a quick hello goes a long way.`;
}

/**
 * The same nudge for someone whose address is missing.
 *
 * The cron used to filter these out with .neq("person_email", ""), which turned
 * a blank field into the person disappearing from the follow-up queue entirely.
 * A gap in what we know is a reason to ask for it, never a reason to forget the
 * person: the whole point of recording a connection is being reminded of it.
 */
export function keepInTouchNoAddressBody(threshold: KeepInTouchThreshold, personName: string) {
  const name = personName.trim() || "them";
  return `You connected with ${name} ${THRESHOLD_COPY[threshold].timeframe}. Add an email or phone number and you can follow up from here.`;
}

export function buildKeepInTouchEmail(threshold: KeepInTouchThreshold, personName: string, appUrl: string) {
  const name = personName.trim() || "them";
  const subject = keepInTouchTitle(threshold, name);
  const body = keepInTouchBody(threshold, name);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="font-size:14px;color:#163300;line-height:20px;">${escapeHtml(body)}</p>
      <a href="${appUrl}/connections" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#163300;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">
        View connections
      </a>
    </div>`;
  return { subject, html };
}

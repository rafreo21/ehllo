import { EHLLO_LOGO_PNG_BASE64 } from "./ehllo-logo-base64";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildGuestFollowUpReminderEmail(input: {
  guestName: string;
  hostName: string;
  actionTitle: string;
  shareUrl: string;
}) {
  const guestFirstName = input.guestName.trim().split(/\s+/)[0] || "there";
  const hostName = input.hostName.trim() || "Someone you met";
  const subject = `Reminder: ${input.actionTitle}`;

  const html = `
    <div style="background:#f2f5f0;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:24px 24px 0;">
            <img src="data:image/png;base64,${EHLLO_LOGO_PNG_BASE64}" alt="ehllo" width="36" height="36" style="display:block;border-radius:8px;" />
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 4px;">
            <h1 style="margin:0;font-size:20px;line-height:1.3;color:#163300;letter-spacing:-0.02em;">Hi ${escapeHtml(guestFirstName)}, a quick reminder</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 16px;">
            <p style="margin:0;font-size:14px;line-height:1.5;color:#454745;">
              After meeting ${escapeHtml(hostName)}, you said you'd take care of: <strong>${escapeHtml(input.actionTitle)}</strong>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px;">
            <a href="${escapeHtml(input.shareUrl)}" style="display:inline-block;background:#163300;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 20px;border-radius:999px;">Mark it done</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8f86;">
              No account needed - this link takes you straight to it.
            </p>
          </td>
        </tr>
      </table>
    </div>`;

  return { subject, html };
}

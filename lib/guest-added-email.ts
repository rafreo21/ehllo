import { AFTERMEET_LOGO_PNG_BASE64 } from "./aftermeet-logo-base64";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildGuestAddedEmail(input: { guestName: string; addedByName: string; appUrl: string }) {
  const guestFirstName = input.guestName.trim().split(/\s+/)[0] || input.guestName.trim();
  const addedBy = input.addedByName.trim() || "Someone you met";
  const subject = `${addedBy} added you as a contact on Ehllo`;

  const html = `
    <div style="background:#f2f5f0;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:24px 24px 0;">
            <img src="data:image/png;base64,${AFTERMEET_LOGO_PNG_BASE64}" alt="Ehllo" width="36" height="36" style="display:block;border-radius:8px;" />
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 4px;">
            <h1 style="margin:0;font-size:22px;line-height:1.3;color:#163300;letter-spacing:-0.02em;">Hi ${escapeHtml(guestFirstName)}, ${escapeHtml(addedBy)} added you as a contact</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 16px;">
            <p style="margin:0;font-size:14px;line-height:1.5;color:#454745;">
              After a conversation, ${escapeHtml(addedBy)} saved your details in Ehllo so they can follow up with you.
              We've set aside a free spot for your own card — sign in to claim it, add your details, and share it back.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px;">
            <a href="${escapeHtml(input.appUrl)}/auth" style="display:inline-block;background:#9fe870;color:#163300;font-weight:700;font-size:14px;text-decoration:none;padding:12px 20px;border-radius:8px;">Claim your card</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px;">
            <p style="margin:0;font-size:13px;line-height:1.5;color:#454745;">
              Once you're in, you'll also see a reminder to follow up with ${escapeHtml(addedBy)} — no need to keep it in your head.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px;">
            <p style="margin:0;font-size:11px;color:#8b948a;">
              You're getting this because ${escapeHtml(addedBy)} added your email as a contact in Ehllo. If this wasn't you, you can ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </div>`;

  return { subject, html };
}

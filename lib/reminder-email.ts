import { EHLLO_LOGO_PNG_BASE64 } from "./ehllo-logo-base64";
import { dueDateBucket, formatDueLabel, type FollowUpItem } from "./follow-ups-server";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function reminderQualifies(item: FollowUpItem) {
  const bucket = dueDateBucket(item.dueAt);
  return bucket === "overdue" || bucket === "today";
}

export function buildReminderDigestEmail(items: FollowUpItem[], appUrl: string) {
  const overdueCount = items.filter((item) => dueDateBucket(item.dueAt) === "overdue").length;
  const todayCount = items.length - overdueCount;

  const headline = overdueCount > 0
    ? `${items.length === 1 ? "1 follow-up needs" : `${items.length} follow-ups need`} you`
    : `${todayCount === 1 ? "1 follow-up is" : `${todayCount} follow-ups are`} due today`;

  const rows = items
    .map((item) => {
      const dueLabel = formatDueLabel(item.dueAt) || "";
      const isOverdue = dueDateBucket(item.dueAt) === "overdue";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #d5d9d3;font-family:Arial,Helvetica,sans-serif;">
            <div style="font-size:14px;color:#163300;font-weight:700;">${escapeHtml(item.title)}</div>
            <div style="font-size:12px;color:#454745;margin-top:2px;">${escapeHtml(item.encounterTitle)}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #d5d9d3;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:${isOverdue ? "#b42318" : "#454745"};white-space:nowrap;">
            ${escapeHtml(dueLabel)}
          </td>
        </tr>`;
    })
    .join("");

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
            <h1 style="margin:0;font-size:22px;line-height:1.2;color:#163300;letter-spacing:-0.02em;">${escapeHtml(headline)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 16px;">
            <p style="margin:0;font-size:14px;color:#454745;">Send the next message while the meeting is still fresh.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <a href="${escapeHtml(appUrl)}/app/followups" style="display:inline-block;background:#9fe870;color:#163300;font-weight:700;font-size:14px;text-decoration:none;padding:12px 20px;border-radius:8px;">Open follow-ups</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px;">
            <p style="margin:0;font-size:11px;color:#8b948a;">You're getting this because you have overdue follow-ups in ehllo. Turn this off any time in Settings.</p>
          </td>
        </tr>
      </table>
    </div>`;

  return { subject: headline, html };
}

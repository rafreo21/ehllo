export type SignatureProfile = {
  name: string;
  role: string;
  company: string;
  cardUrl: string;
  showCompany?: boolean;
  photoUrl?: string;
  email?: string;
  phone?: string;
  themeColor?: string;
  qrDataUri?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Where the signature's images are fetched from.
//
// This deliberately does NOT just reuse the card's origin. A signature composed against a dev
// server emitted http://localhost:3000/email-icons/..., which no email client on earth can
// reach - the images were simply missing and nothing said so. An email is read outside your
// network, so its assets have to come from a public host.
//
// A card URL is used when it is already public https; anything else (localhost, an IP, http)
// falls back to the canonical site.
const PUBLIC_ASSET_ORIGIN = 'https://ehllo.io';

function signatureAssetOrigin(cardUrl: string) {
  try {
    const url = new URL(cardUrl.trim());
    if (url.protocol !== 'https:') return PUBLIC_ASSET_ORIGIN;
    if (url.hostname === 'localhost' || /^[\d.]+$/.test(url.hostname)) return PUBLIC_ASSET_ORIGIN;
    return url.origin;
  } catch {
    return PUBLIC_ASSET_ORIGIN;
  }
}

// A hosted 14px monochrome PNG rather than a Unicode dingbat.
//
// The old markup used &#9742; and &#9993;. Gmail, Apple Mail and most phones promote those
// code points to full-colour emoji, so a professional signature arrived looking like a chat
// message - and where they are NOT promoted they fall back to whatever the system font has,
// which is inconsistent. A PNG in the same ink as the text cannot be substituted.
//
// Inline SVG and data URIs were the other options and both lose: Gmail strips SVG and blocks
// data-URI images. The alt text carries the label, so a client that blocks remote images shows
// "Phone" rather than a broken-image icon.
function contactIcon(origin: string, file: "phone" | "envelope", label: string) {
  return `<img src="${origin}/email-icons/${file}.png" width="14" height="14" alt="${label}"`
    + ` style="display:block;width:14px;height:14px;border:0;" />`;
}

function contactRows(profile: SignatureProfile) {
  const rows: string[] = [];
  const origin = signatureAssetOrigin(profile.cardUrl);
  if (profile.phone?.trim()) {
    rows.push(
      `<tr><td style="padding:0 8px 0 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#53634D;">${contactIcon(origin, 'phone', 'Phone')}</td>`,
      `<td style="padding:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#163300;"><a href="tel:${escapeHtml(profile.phone.trim())}" style="color:#163300;text-decoration:none;">${escapeHtml(profile.phone.trim())}</a></td></tr>`,
    );
  }
  if (profile.email?.trim()) {
    rows.push(
      `<tr><td style="padding:0 8px 0 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#53634D;">${contactIcon(origin, 'envelope', 'Email')}</td>`,
      `<td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#163300;"><a href="mailto:${escapeHtml(profile.email.trim())}" style="color:#163300;text-decoration:none;">${escapeHtml(profile.email.trim())}</a></td></tr>`,
    );
  }
  return rows.join('');
}

export function buildPlainSignature(profile: SignatureProfile) {
  const lines = [profile.name.trim()];
  if (profile.role.trim()) lines.push(profile.role.trim());
  if (profile.showCompany !== false && profile.company.trim()) lines.push(profile.company.trim());
  if (profile.phone?.trim()) lines.push(profile.phone.trim());
  if (profile.email?.trim()) lines.push(profile.email.trim());
  lines.push('');
  lines.push(`View my card: ${profile.cardUrl.trim()}`);
  if (profile.photoUrl?.trim()) {
    lines.push(`Photo: ${profile.photoUrl.trim()}`);
  }
  lines.push('');
  lines.push('Shared with ehllo');
  return lines.join('\n');
}

export function buildHtmlSignature(profile: SignatureProfile) {
  const name = escapeHtml(profile.name.trim());
  const role = escapeHtml(profile.role.trim());
  const company = profile.showCompany !== false ? escapeHtml(profile.company.trim()) : '';
  const cardUrl = escapeHtml(profile.cardUrl.trim());
  const initials = escapeHtml(initialsFor(profile.name));
  const assetOrigin = signatureAssetOrigin(profile.cardUrl);

  const avatarCell = profile.photoUrl?.trim()
    ? `<img src="${escapeHtml(profile.photoUrl.trim())}" alt="${name}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:10px;object-fit:cover;" />`
    : `<div style="width:64px;height:64px;border-radius:10px;background:#163300;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:64px;text-align:center;">${initials}</div>`;

  const contactHtml = contactRows(profile);
  const qrBlock = profile.qrDataUri?.trim()
    ? [
        `<div style="padding-top:12px;">`,
        `<img src="${escapeHtml(profile.qrDataUri.trim())}" alt="Scan to open my ehllo card" width="96" height="96" style="display:block;width:96px;height:96px;border-radius:12px;" />`,
        `<div style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;">`,
        `<a href="${cardUrl}" target="_blank" rel="noopener noreferrer" style="color:#2F5711;text-decoration:none;font-weight:700;">View my card</a>`,
        `</div>`,
        `</div>`,
      ].join('')
    : [
        `<div style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;">`,
        `<a href="${cardUrl}" target="_blank" rel="noopener noreferrer" style="color:#2F5711;text-decoration:none;font-weight:700;">View my card</a>`,
        `</div>`,
      ].join('');

  return [
    '<!-- ehllo email signature -->',
    '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;max-width:420px;">',
    '<tr>',
    `<td valign="top" style="padding:0 16px 0 0;">${avatarCell}</td>`,
    '<td valign="top">',
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#163300;">${name}</div>`,
    role
      ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#53634D;padding-top:2px;">${role}</div>`
      : '',
    company
      ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#53634D;padding-top:2px;">${company}</div>`
      : '',
    contactHtml
      ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:10px;">${contactHtml}</table>`
      : '',
    qrBlock,
    '</td>',
    '</tr>',
    '<tr>',
    `<td colspan="2" style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#71806B;">`,
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>`,
    `<td valign="middle" style="padding:0 6px 0 0;"><img src="${assetOrigin}/ehllo-mark.png" width="14" height="14" alt="ehllo" style="display:block;width:14px;height:14px;border:0;" /></td>`,
    `<td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#71806B;">`,
    `Shared with <a href="${assetOrigin}" target="_blank" rel="noopener noreferrer" style="color:#2F5711;font-weight:700;text-decoration:none;">ehllo</a>`,
    `</td>`,
    `</tr></table>`,
    `</td>`,
    '</tr>',
    '</table>',
  ].filter(Boolean).join('');
}

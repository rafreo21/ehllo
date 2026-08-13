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

function contactRows(profile: SignatureProfile) {
  const rows: string[] = [];
  if (profile.phone?.trim()) {
    rows.push(
      '<tr><td style="padding:0 8px 0 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#53634D;">&#9742;</td>',
      `<td style="padding:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#163300;"><a href="tel:${escapeHtml(profile.phone.trim())}" style="color:#163300;text-decoration:none;">${escapeHtml(profile.phone.trim())}</a></td></tr>`,
    );
  }
  if (profile.email?.trim()) {
    rows.push(
      '<tr><td style="padding:0 8px 0 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;color:#53634D;">&#9993;</td>',
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
  lines.push('Shared with Ehllo');
  return lines.join('\n');
}

export function buildHtmlSignature(profile: SignatureProfile) {
  const name = escapeHtml(profile.name.trim());
  const role = escapeHtml(profile.role.trim());
  const company = profile.showCompany !== false ? escapeHtml(profile.company.trim()) : '';
  const cardUrl = escapeHtml(profile.cardUrl.trim());
  const initials = escapeHtml(initialsFor(profile.name));

  const avatarCell = profile.photoUrl?.trim()
    ? `<img src="${escapeHtml(profile.photoUrl.trim())}" alt="${name}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:10px;object-fit:cover;" />`
    : `<div style="width:64px;height:64px;border-radius:10px;background:#163300;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:64px;text-align:center;">${initials}</div>`;

  const contactHtml = contactRows(profile);
  const qrBlock = profile.qrDataUri?.trim()
    ? [
        `<div style="padding-top:12px;">`,
        `<img src="${escapeHtml(profile.qrDataUri.trim())}" alt="Scan to open my Ehllo card" width="96" height="96" style="display:block;width:96px;height:96px;border-radius:12px;" />`,
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
    '<!-- Ehllo email signature -->',
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
    '<td colspan="2" style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#71806B;">',
    'Shared with <span style="color:#2F5711;font-weight:700;">Ehllo</span>',
    '</td>',
    '</tr>',
    '</table>',
  ].filter(Boolean).join('');
}

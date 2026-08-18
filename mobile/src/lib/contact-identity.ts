// Shared identity-matching helpers for deciding "is this the same person" -
// used anywhere we dedupe/merge people by email or phone (Recent Scans,
// Connections merging, directory "already saved" checks). Deliberately a
// fixed correction list rather than fuzzy/edit-distance matching, which
// risks merging two genuinely different people with similar-looking emails.

const EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'icloud.con': 'icloud.com',
  'icloud.co': 'icloud.com',
  'iclou.com': 'icloud.com',
};

export function normalizeEmailForMatching(value?: string | null): string {
  const trimmed = value?.trim().toLowerCase() || '';
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex < 0) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  return `${local}@${EMAIL_DOMAIN_TYPOS[domain] || domain}`;
}

// Country codes make the same number look different across records (e.g.
// "+447473177720" vs "07473177720"). Comparing the last 10 digits is a
// heuristic, not full E.164 parsing, but covers the common single-country
// case without pulling in a phone-number-parsing dependency.
export function normalizePhoneForMatching(value?: string | null): string {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

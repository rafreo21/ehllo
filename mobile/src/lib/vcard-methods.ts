import type { ContactMethod } from '@/features/card/types';
import { contactMethodVcardHref } from '@/lib/contact-methods';

const METHOD_LABELS: Record<string, string> = {
  website: 'Website',
  link: 'Link',
  linkedin: 'LinkedIn',
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  facebook: 'Facebook',
  youtube: 'YouTube',
  snapchat: 'Snapchat',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  yelp: 'Yelp',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  discord: 'Discord',
  skype: 'Skype',
  telegram: 'Telegram',
  github: 'GitHub',
  calendly: 'Calendly',
  paypal: 'PayPal',
  venmo: 'Venmo',
  cashapp: 'Cash App',
};

function escapeVcard(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function normalizeTel(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, '');
  return normalized.startsWith('+')
    ? `+${normalized.slice(1).replace(/\+/g, '')}`
    : normalized.replace(/\+/g, '');
}

function methodLabel(method: ContactMethod) {
  const custom = method.label?.trim();
  if (custom) return custom;
  return METHOD_LABELS[method.type] || method.type;
}

function defaultMethodLabel(methodType: string) {
  return METHOD_LABELS[methodType] || methodType;
}

function hasCustomMethodLabel(method: ContactMethod) {
  const custom = method.label?.trim();
  if (!custom) return false;
  const defaults = new Set([
    defaultMethodLabel(method.type),
    method.type,
  ].map((entry) => entry.toLowerCase()));
  return !defaults.has(custom.toLowerCase());
}

function appendLabeledUrl(lines: string[], itemIndex: number, label: string, href: string) {
  lines.push(`item${itemIndex}.URL:${escapeVcard(href)}`);
  lines.push(`item${itemIndex}.X-ABLabel:${escapeVcard(label)}`);
}

function appendLabeledItemField(
  lines: string[],
  itemIndex: number,
  field: 'EMAIL' | 'TEL' | 'URL',
  fieldParams: string,
  value: string,
  label: string,
) {
  lines.push(`item${itemIndex}.${field}${fieldParams}:${escapeVcard(value)}`);
  lines.push(`item${itemIndex}.X-ABLabel:${escapeVcard(label)}`);
}

export type MobileVcardMethodOptions = {
  showCompanyDetails?: boolean;
  /** Name + one email + one phone only (last-resort QR size). */
  minimal?: boolean;
  /**
   * Lean export: keep every method, drop address only to shrink QR.
   * Prefer this over dropping social fields.
   */
  lean?: boolean;
};

function shouldIncludeMethod(method: ContactMethod, options: MobileVcardMethodOptions) {
  if (options.minimal) {
    return method.type === 'email' || method.type === 'phone';
  }
  if (options.lean && method.type === 'address') {
    return false;
  }
  if (!(options.showCompanyDetails ?? true) && method.type === 'website') {
    return false;
  }
  return true;
}

function shouldIncludeLabeledUrl(method: ContactMethod, options: MobileVcardMethodOptions) {
  if (options.minimal) return false;
  return true;
}

export function appendMobileVcardMethods(
  lines: string[],
  methods: ContactMethod[],
  options: MobileVcardMethodOptions = {},
): { itemIndex: number; noteExtras: string[] } {
  const labeledUrls: { label: string; href: string }[] = [];
  const noteExtras: string[] = [];
  let primaryWebsite: string | null = null;
  let itemIndex = 1;
  let emailCount = 0;
  let phoneCount = 0;
  const phoneNumbers = new Set<string>();

  for (const method of methods) {
    const value = method.value.trim();
    if (!value || !shouldIncludeMethod(method, options)) continue;

    const label = methodLabel(method);
    const href = contactMethodVcardHref(method);
    const customLabel = hasCustomMethodLabel(method);

    if (method.type === 'email') {
      if (options.minimal && emailCount > 0) continue;
      if (customLabel || emailCount > 0) {
        appendLabeledItemField(lines, itemIndex, 'EMAIL', ';TYPE=INTERNET', value, label);
        itemIndex += 1;
      } else {
        lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(value)}`);
      }
      emailCount += 1;
      continue;
    }

    if (method.type === 'phone') {
      const tel = normalizeTel(value);
      if (tel.length < 5) {
        noteExtras.push(`${label}: ${value}`);
        continue;
      }
      if (options.minimal && phoneCount > 0) continue;
      if (customLabel || phoneCount > 0) {
        appendLabeledItemField(lines, itemIndex, 'TEL', ';TYPE=CELL,VOICE', tel, label);
        itemIndex += 1;
      } else {
        lines.push(`TEL;TYPE=CELL,VOICE:${escapeVcard(tel)}`);
      }
      phoneNumbers.add(tel);
      phoneCount += 1;
      continue;
    }

    if (method.type === 'whatsapp') {
      const tel = normalizeTel(value);
      if (tel.length >= 5 && !phoneNumbers.has(tel)) {
        if (customLabel || phoneCount > 0) {
          appendLabeledItemField(lines, itemIndex, 'TEL', ';TYPE=CELL,VOICE', tel, label);
          itemIndex += 1;
        } else {
          lines.push(`TEL;TYPE=CELL,VOICE:${escapeVcard(tel)}`);
        }
        phoneNumbers.add(tel);
        phoneCount += 1;
      }
      if (href && shouldIncludeLabeledUrl(method, options)) {
        labeledUrls.push({ label, href });
      } else if (!href) {
        noteExtras.push(`${label}: ${value}`);
      }
      continue;
    }

    if (method.type === 'address') {
      lines.push(`ADR;TYPE=WORK:;;${escapeVcard(value)};;;;`);
      continue;
    }

    if (method.type === 'website' || method.type === 'link' || method.type === 'calendly') {
      if (!href) {
        noteExtras.push(`${label}: ${value}`);
        continue;
      }
      const usePrimary = !primaryWebsite && !customLabel && href.startsWith('http');
      if (usePrimary) {
        primaryWebsite = href;
        continue;
      }
      if (shouldIncludeLabeledUrl(method, options)) {
        labeledUrls.push({ label, href });
      }
      continue;
    }

    if (!href) {
      noteExtras.push(`${label}: ${value}`);
      continue;
    }

    if (!shouldIncludeLabeledUrl(method, options)) continue;

    if (href.startsWith('http') || href.startsWith('skype:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      labeledUrls.push({ label, href });
      continue;
    }

    noteExtras.push(`${label}: ${value}`);
  }

  if (primaryWebsite) {
    lines.push(`URL:${escapeVcard(primaryWebsite)}`);
  }

  for (const entry of labeledUrls) {
    if (primaryWebsite && entry.href === primaryWebsite) continue;
    appendLabeledUrl(lines, itemIndex, entry.label, entry.href);
    itemIndex += 1;
  }

  return { itemIndex, noteExtras };
}

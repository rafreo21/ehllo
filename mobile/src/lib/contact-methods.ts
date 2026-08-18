import { contactActionUrl } from '@/features/card/contact-actions';
import type { ContactMethod } from '@/features/card/types';

export type ContactMethodLike = {
  type: string;
  value: string;
};

export function contactMethodHref(method: ContactMethodLike): string | null {
  return contactActionUrl(method as ContactMethod);
}

function webOr(value: string, fallback: string) {
  return /^https?:\/\//i.test(value) ? value : fallback;
}

function username(value: string) {
  return value.trim().replace(/^@/, '').replace(/^\/+|\/+$/g, '');
}

function profileUrl(value: string, build: (handle: string) => string) {
  if (/^https?:\/\//i.test(value)) return value;
  const handle = username(value);
  return handle ? build(handle) : null;
}

function phoneNumber(value: string) {
  const normalized = value.trim().replace(/[^\d+]/g, '');
  return normalized.startsWith('+')
    ? `+${normalized.slice(1).replace(/\+/g, '')}`
    : normalized.replace(/\+/g, '');
}

/**
 * HTTPS / Contacts-safe hrefs for vCard export.
 * Do not use native app schemes here - phone address books ignore or break them.
 */
export function contactMethodVcardHref(method: ContactMethodLike): string | null {
  const value = method.value.trim();
  if (!value) return null;

  switch (method.type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : null;
    case 'phone': {
      const phone = phoneNumber(value);
      return phone.length >= 5 ? `tel:${phone}` : null;
    }
    case 'website':
    case 'link':
    case 'calendly':
      return webOr(value, `https://${value.replace(/^\/+/, '')}`);
    case 'address':
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
    case 'x':
      return profileUrl(value, (handle) => `https://x.com/${handle}`);
    case 'instagram':
      return profileUrl(value, (handle) => `https://instagram.com/${handle}`);
    case 'threads':
      return profileUrl(value, (handle) => `https://threads.net/@${handle}`);
    case 'linkedin':
      return profileUrl(value, (handle) => `https://linkedin.com/in/${handle}`);
    case 'facebook':
      return profileUrl(value, (handle) => `https://facebook.com/${handle}`);
    case 'youtube':
      return profileUrl(value, (handle) => `https://youtube.com/@${handle}`);
    case 'snapchat':
      return profileUrl(value, (handle) => `https://snapchat.com/add/${handle}`);
    case 'tiktok':
      return profileUrl(value, (handle) => `https://tiktok.com/@${handle}`);
    case 'twitch':
      return profileUrl(value, (handle) => `https://twitch.tv/${handle}`);
    case 'yelp':
      return webOr(value, `https://www.yelp.com/search?find_desc=${encodeURIComponent(value)}`);
    case 'whatsapp': {
      if (/^https?:\/\//i.test(value)) return value;
      const phone = phoneNumber(value).replace(/^\+/, '');
      return phone.length >= 5 ? `https://wa.me/${phone}` : null;
    }
    case 'signal': {
      if (/^https?:\/\//i.test(value)) return value;
      const phone = phoneNumber(value);
      return phone.length >= 5 ? `https://signal.me/#p/${encodeURIComponent(phone)}` : null;
    }
    case 'discord':
      return /^https?:\/\//i.test(value) ? value : null;
    case 'skype':
      return username(value) ? `skype:${encodeURIComponent(username(value))}?chat` : null;
    case 'telegram':
      return profileUrl(value, (handle) => `https://t.me/${handle}`);
    case 'github':
      return profileUrl(value, (handle) => `https://github.com/${handle}`);
    case 'paypal':
      return profileUrl(value, (handle) => `https://paypal.me/${handle}`);
    case 'venmo':
      return profileUrl(value, (handle) => `https://account.venmo.com/u/${handle}`);
    case 'cashapp':
      return profileUrl(value, (handle) => `https://cash.app/$${handle.replace(/^\$/, '')}`);
    default:
      return /^https?:\/\//i.test(value) ? value : null;
  }
}

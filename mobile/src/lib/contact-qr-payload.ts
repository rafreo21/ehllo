import { cardWithCompanyVisibility, showsCompanyDetails } from '@/features/card/company-display';
import type { MobileCard } from '@/features/card/types';
import { publicCardImageUrl } from '@/lib/card-assets-client';
import { appendVcardImages, type VcardEmbeddedImage, type VcardImageFields } from '@/lib/vcard-images';
import { appendMobileVcardMethods } from '@/lib/vcard-methods';

function escapeVcard(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Mirrors lib/card-share-links.ts's buildWhenWeMetNote (web) so both vCard exports match.
 * eventTitle is an activator: omit it and this note reads exactly as before.
 */
function buildWhenWeMetNote(cardUrl: string, scannedAt = new Date(), eventTitle?: string) {
  const date = scannedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const trimmedEvent = eventTitle?.trim();
  const whereLine = trimmedEvent ? `Where we met: ${trimmedEvent}\n` : '';
  return `${whereLine}When we met: ${date}\nSaved from ehllo\n${cardUrl}`;
}

export type MobileContactQrOptions = {
  /** Keep every contact method; drop bio / cover / photos to shrink QR. */
  lean?: boolean;
  /** Name, primary email/phone, and ehllo card URL only (last resort). */
  minimal?: boolean;
  /** Omit photo/logo URI lines (methods stay complete). */
  omitImages?: boolean;
  /** Omit bio and cover photo URL. */
  omitBioCover?: boolean;
  /** Embed a pre-built tiny thumbnail instead of a profile photo URL, when it fits. */
  embeddedPhoto?: VcardEmbeddedImage | null;
  /** The sharer's currently-happening event, if any - an activator: omit it and the note is unchanged. */
  eventTitle?: string;
};

function vcardImageFields(card: MobileCard, options: MobileContactQrOptions): VcardImageFields {
  if (options.minimal || options.omitImages) return {};

  const showCompany = showsCompanyDetails(card);
  const profilePhotoUrl = publicCardImageUrl(card.photo);
  const companyLogoUrl = showCompany ? publicCardImageUrl(card.companyLogo) : null;
  const coverPhotoUrl = options.omitBioCover ? null : publicCardImageUrl(card.coverPhoto);

  return {
    ...(options.embeddedPhoto
      ? { profilePhoto: options.embeddedPhoto }
      : (profilePhotoUrl ? { profilePhotoUrl } : {})),
    ...(companyLogoUrl ? { companyLogoUrl, showCompanyDetails: true } : {}),
    ...(coverPhotoUrl ? { coverPhotoUrl } : {}),
    showCompanyDetails: showCompany,
  };
}

/** Offline-capable QR payload with contact details and the card URL. */
export function buildMobileContactQrPayload(
  card: MobileCard,
  cardUrl: string,
  options: MobileContactQrOptions = {},
): string {
  const visible = cardWithCompanyVisibility(card);
  const showCompany = showsCompanyDetails(visible);
  const { firstName, lastName } = splitFullName(visible.name);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'PRODID:-//ehllo//Contact Card//EN',
    `N:${escapeVcard(lastName)};${escapeVcard(firstName)};;;`,
    `FN:${escapeVcard(visible.name.trim())}`,
  ];

  appendVcardImages(lines, vcardImageFields(visible, options));

  if (visible.role.trim()) lines.push(`TITLE:${escapeVcard(visible.role.trim())}`);
  if (showCompany && visible.company.trim()) lines.push(`ORG:${escapeVcard(visible.company.trim())}`);

  const { itemIndex, noteExtras } = appendMobileVcardMethods(lines, visible.methods, {
    showCompanyDetails: showCompany,
    lean: options.lean,
    minimal: options.minimal,
  });

  let nextItemIndex = itemIndex;
  const cardPage = cardUrl.trim();
  if (cardPage) {
    const cardAlreadyLinked = lines.some((line) => line.includes(cardPage));
    if (!cardAlreadyLinked) {
      lines.push(`item${nextItemIndex}.URL:${escapeVcard(cardPage)}`);
      lines.push(`item${nextItemIndex}.X-ABLabel:${escapeVcard('ehllo card')}`);
      nextItemIndex += 1;
    }
  }

  const coverUrl = vcardImageFields(visible, options).coverPhotoUrl;
  if (!options.minimal && !options.omitBioCover && coverUrl?.trim()) {
    lines.push(`item${nextItemIndex}.URL:${escapeVcard(coverUrl.trim())}`);
    lines.push(`item${nextItemIndex}.X-ABLabel:${escapeVcard('Cover photo')}`);
  }

  const noteParts: string[] = [];
  if (!options.minimal && !options.omitBioCover && visible.bio.trim()) {
    noteParts.push(visible.bio.trim());
  }
  if (noteExtras.length) {
    noteParts.push(...noteExtras);
  }
  if (!options.minimal && cardPage) {
    noteParts.push(buildWhenWeMetNote(cardPage, new Date(), options.eventTitle));
  }
  if (noteParts.length) {
    lines.push(`NOTE:${escapeVcard(noteParts.join('\n\n'))}`);
  }
  lines.push('END:VCARD');

  return lines.join('\r\n');
}

import type { MobileCard } from '@/features/card/types';
import { CARD_THEMES, normalizeThemeColor } from '@/features/card/theme-colors';

export const MAX_CARDS = 5;
export const CARDS_STORAGE_KEY = 'aftermeet.mobile.cards.v2';
export const ACTIVE_CARD_KEY = 'aftermeet.mobile.active-card.v1';
export const LEGACY_CARD_KEY = 'aftermeet.mobile.card.v1';
export const DIRTY_CARDS_STORAGE_KEY = 'aftermeet.mobile.dirty-cards.v1';

function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createMobileCard(seed: Partial<MobileCard> = {}): MobileCard {
  const id = seed.id || createId();
  const slug = seed.slug || `card-${id.replace(/-/g, '').slice(0, 16)}`;
  return {
    id,
    slug,
    label: seed.label || 'New card',
    name: seed.name || '',
    role: seed.role || '',
    company: seed.company || '',
    bio: seed.bio || '',
    theme: normalizeThemeColor(seed.theme || CARD_THEMES[0]),
    photo: seed.photo || '',
    companyLogo: seed.companyLogo || '',
    coverPhoto: seed.coverPhoto || '',
    showCompanyDetails: seed.showCompanyDetails ?? (seed as { showCompanyLogo?: boolean }).showCompanyLogo ?? true,
    status: seed.status || 'draft',
    methods: seed.methods || [],
  };
}

export function getActiveCardId(cards: MobileCard[], storedId: string | null) {
  if (storedId && cards.some((card) => card.id === storedId)) return storedId;
  return cards[0]?.id || '';
}

export function remoteRowToMobileCard(remote: {
  id: string;
  slug: string;
  label?: string | null;
  full_name: string;
  job_title?: string | null;
  company?: string | null;
  bio?: string | null;
  theme_color?: string | null;
  profile_image_url?: string | null;
  company_logo_url?: string | null;
  cover_image_url?: string | null;
  show_company_details?: boolean | null;
  status: 'draft' | 'published' | 'archived';
  card_methods?: {
    id: string;
    method_type: MobileCard['methods'][number]['type'];
    value: string;
    label: string;
    sort_order: number;
  }[];
}): MobileCard {
  return {
    id: remote.id,
    slug: remote.slug,
    label: remote.label || remote.full_name || 'My card',
    name: remote.full_name,
    role: remote.job_title || '',
    company: remote.company || '',
    bio: remote.bio || '',
    theme: normalizeThemeColor(remote.theme_color || CARD_THEMES[0]),
    photo: remote.profile_image_url || '',
    companyLogo: remote.company_logo_url || '',
    coverPhoto: remote.cover_image_url || '',
    showCompanyDetails: remote.show_company_details ?? true,
    status: remote.status === 'published' ? 'published' : 'draft',
    methods: (remote.card_methods || [])
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((method) => ({
        id: method.id,
        type: method.method_type,
        value: method.value,
        label: method.label,
      })),
  };
}

export function libraryPayloadToMobileCard(card: {
  id: string;
  slug: string;
  label?: string;
  name: string;
  role?: string;
  company?: string;
  bio?: string;
  theme?: string;
  photo?: string;
  companyLogo?: string;
  coverPhoto?: string;
  showCompanyDetails?: boolean;
  status?: 'draft' | 'published';
  methods?: MobileCard['methods'];
}): MobileCard {
  return normalizePayloadCard({
    id: card.id,
    slug: card.slug,
    label: card.label || card.name || 'My card',
    name: card.name,
    role: card.role || '',
    company: card.company || '',
    bio: card.bio || '',
    theme: card.theme || CARD_THEMES[0],
    photo: card.photo || '',
    companyLogo: card.companyLogo || '',
    coverPhoto: card.coverPhoto || '',
    showCompanyDetails: card.showCompanyDetails ?? true,
    status: card.status || 'draft',
    methods: card.methods || [],
  });
}

function normalizePayloadCard(card: MobileCard): MobileCard {
  return {
    ...card,
    theme: normalizeThemeColor(card.theme),
  };
}

export function mobileCardToLibraryPayload(card: MobileCard) {
  return {
    id: card.id,
    slug: card.slug,
    label: card.label || card.name || 'My card',
    name: card.name,
    role: card.role,
    company: card.company,
    bio: card.bio,
    theme: normalizeThemeColor(card.theme),
    photo: card.photo,
    companyLogo: card.companyLogo,
    coverPhoto: card.coverPhoto,
    showCompanyDetails: card.showCompanyDetails,
    methods: card.methods,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

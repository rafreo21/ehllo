import type { MobileCard } from '@/features/card/types';
import { CARD_THEMES, normalizeThemeColor } from '@/features/card/theme-colors';
import type { ConnectionItem } from '@/features/connections/connections-api';
import { readEnv } from '@/lib/env';

export type PublicConnectionCard = {
  id: string;
  slug: string;
  fullName: string;
  role: string;
  company: string;
  bio: string;
  themeColor: string;
  profileImageUrl: string;
  coverImageUrl: string;
  companyLogoUrl: string;
  showCompanyDetails: boolean;
  methods: {
    id: string;
    type: MobileCard['methods'][number]['type'];
    value: string;
    label: string;
    sortOrder: number;
  }[];
};

export function publicCardToMobileCard(card: PublicConnectionCard): MobileCard {
  return {
    id: card.id,
    slug: card.slug,
    label: card.fullName,
    name: card.fullName,
    role: card.role,
    company: card.company,
    bio: card.bio,
    theme: normalizeThemeColor(card.themeColor || CARD_THEMES[0]),
    photo: card.profileImageUrl,
    companyLogo: card.companyLogoUrl,
    coverPhoto: card.coverImageUrl,
    showCompanyDetails: card.showCompanyDetails,
    status: 'published',
    methods: card.methods.map((method) => ({
      id: method.id,
      type: method.type,
      value: method.value,
      label: method.label,
    })),
  };
}

export async function fetchPublicConnectionCard(slug: string) {
  const base = readEnv()?.publicCardBaseUrl;
  if (!base || !slug.trim()) return null;

  const response = await fetch(`${base}/api/cards/public/${encodeURIComponent(slug.trim().toLowerCase())}`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) return null;

  const payload = await response.json() as { card?: PublicConnectionCard };
  return payload.card ?? null;
}

export function connectionCardFromProfile(connection: ConnectionItem): MobileCard | null {
  if (!connection.name.trim()) return null;

  const methods: MobileCard['methods'] = [];
  if (connection.email?.trim()) {
    methods.push({ id: 'email', type: 'email', value: connection.email.trim(), label: 'Email' });
  }
  if (connection.phone?.trim()) {
    methods.push({ id: 'phone', type: 'phone', value: connection.phone.trim(), label: 'Phone' });
  }

  const slug = connection.cardSlug?.trim()
    || connection.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    || 'connection';

  return {
    id: connection.id,
    slug,
    label: connection.name.trim(),
    name: connection.name.trim(),
    role: connection.role?.trim() || '',
    company: connection.company?.trim() || '',
    bio: '',
    theme: CARD_THEMES[0],
    photo: connection.photoUrl || '',
    companyLogo: '',
    coverPhoto: '',
    showCompanyDetails: Boolean(connection.company?.trim()),
    status: 'published',
    methods,
  };
}

export function connectionAvatarUrl(connection: { name: string; photoUrl?: string; email?: string }) {
  if (connection.photoUrl?.trim()) return connection.photoUrl.trim();
  const label = encodeURIComponent(connection.name.trim() || 'Connection');
  return `https://ui-avatars.com/api/?name=${label}&background=E9F7DF&color=163300&size=128`;
}

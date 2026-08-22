import { appDeepLink } from '@/lib/app-scheme';
import type { MobileCard } from '@/features/card/types';

export function shareCardDeepLink(card: Pick<MobileCard, 'id' | 'slug'>) {
  const params = new URLSearchParams();
  if (card.id) params.set('id', card.id);
  if (card.slug) params.set('slug', card.slug);
  const query = params.toString();
  return appDeepLink('share-card', query || undefined);
}

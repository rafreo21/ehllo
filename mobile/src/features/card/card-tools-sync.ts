import type { MobileCard } from '@/features/card/types';
import { syncAllWidgets } from '@/features/card/widget-sync';

export async function syncCardToolsForCard(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
) {
  if (!cards.length) return;

  try {
    await syncAllWidgets(cards, cardPublicUrl, accessToken, preferredCard);
  } catch (caught) {
    // Best effort by design - a widget that will not update must not break the screen that
    // triggered it. But it says so now. Swallowing this silently is why an oversized QR could
    // fail every widget render for weeks with nothing anywhere to say why, and why "the widget
    // is not working" arrived with no detail attached.
    console.error('[card-tools-sync] widget sync failed', {
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }
}

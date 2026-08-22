import type { MobileCard } from '@/features/card/types';
import { syncAllWidgets } from '@/features/card/widget-sync';

export async function syncCardToolsForCard(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
) {
  // No early return on an empty card list. Bailing out here meant a signed-out phone, or one
  // with no cards yet, never wrote a snapshot at all - so the widgets read empty preferences,
  // treated "no snapshot" as "gallery preview", and put the demo person on a real home screen.
  // The empty case is exactly the case the widgets need to be told about.
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

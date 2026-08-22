import type { MobileCard } from '@/features/card/types';
import { syncAllWidgets } from '@/features/card/widget-sync';

export async function syncCardToolsForCard(
  cards: MobileCard[],
  cardPublicUrl: (card: MobileCard) => string,
  accessToken?: string,
  preferredCard?: MobileCard,
  // Every other caller here is a background sync riding along on a screen the user did not
  // come to for the widget's sake (app launch, card publish, a card edit) - for those, a widget
  // that will not update must not break the screen that triggered it, so the default stays
  // swallow-and-log. The "Refresh home-screen widgets" button in card-tools.tsx is the one
  // caller where a person explicitly asked "did this work?" and got an unconditional "Widget
  // data refreshed" toast even when this threw - which is exactly why a tester's still-broken
  // widget looked, from the app's own UI, like it had already been fixed. rethrow lets that one
  // caller opt into the real answer instead.
  { rethrow = false }: { rethrow?: boolean } = {},
) {
  // No early return on an empty card list. Bailing out here meant a signed-out phone, or one
  // with no cards yet, never wrote a snapshot at all - so the widgets read empty preferences,
  // treated "no snapshot" as "gallery preview", and put the demo person on a real home screen.
  // The empty case is exactly the case the widgets need to be told about.
  try {
    await syncAllWidgets(cards, cardPublicUrl, accessToken, preferredCard);
  } catch (caught) {
    console.error('[card-tools-sync] widget sync failed', {
      message: caught instanceof Error ? caught.message : String(caught),
    });
    if (rethrow) throw caught;
  }
}

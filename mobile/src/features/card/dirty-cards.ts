import AsyncStorage from '@react-native-async-storage/async-storage';

import { CARDS_STORAGE_KEY, DIRTY_CARDS_STORAGE_KEY } from '@/features/card/card-library';
import type { MobileCard } from '@/features/card/types';

export type DirtyCardEntry = {
  id: string;
  label: string;
};

// Cards with local edits/creates not yet confirmed synced to the server -
// see setCardDirty in card-context.tsx. Read independently here (rather than
// through CardProvider) so the Pending Sync screen can list them without
// depending on the card context being mounted.
export async function readDirtyCards(): Promise<DirtyCardEntry[]> {
  try {
    const [dirtyRaw, cardsRaw] = await Promise.all([
      AsyncStorage.getItem(DIRTY_CARDS_STORAGE_KEY),
      AsyncStorage.getItem(CARDS_STORAGE_KEY),
    ]);
    const dirtyIds = JSON.parse(dirtyRaw || '[]');
    if (!Array.isArray(dirtyIds) || !dirtyIds.length) return [];
    const cards = JSON.parse(cardsRaw || '[]');
    const byId = new Map((Array.isArray(cards) ? cards as MobileCard[] : []).map((card) => [card.id, card]));
    const validIds = dirtyIds
      .filter((id): id is string => typeof id === 'string' && byId.has(id));
    if (validIds.length !== dirtyIds.length) {
      await AsyncStorage.setItem(DIRTY_CARDS_STORAGE_KEY, JSON.stringify(validIds));
    }
    return validIds
      .map((id) => {
        const card = byId.get(id);
        return { id, label: card?.label || card?.name || 'Untitled card' };
      });
  } catch {
    return [];
  }
}

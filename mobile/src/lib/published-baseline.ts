import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

import type { MobileCard } from '@/features/card/types';
import { cardDraftSignature } from '@/lib/card-draft';

const PUBLISHED_BASELINE_KEY = 'aftermeet.mobile.published-baseline.v1';

type PublishedBaselineMap = Record<string, string>;

async function readBaselineMap(): Promise<PublishedBaselineMap> {
  try {
    const raw = await AsyncStorage.getItem(PUBLISHED_BASELINE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PublishedBaselineMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeBaselineMap(map: PublishedBaselineMap) {
  await AsyncStorage.setItem(PUBLISHED_BASELINE_KEY, JSON.stringify(map));
}

/** Snapshot signature stored when a card was last successfully published. */
export async function readPublishedBaseline(cardId: string) {
  if (!cardId) return null;
  const map = await readBaselineMap();
  return map[cardId] ?? null;
}

export async function writePublishedBaseline(card: MobileCard) {
  if (!card.id) return;
  const map = await readBaselineMap();
  map[card.id] = cardDraftSignature({ ...card, status: 'published' });
  await writeBaselineMap(map);
}

/** Seed baseline for cards published before baseline tracking existed. */
export async function ensurePublishedBaseline(card: MobileCard) {
  if (card.status !== 'published' || !card.id) return null;
  const existing = await readPublishedBaseline(card.id);
  if (existing) return existing;
  await writePublishedBaseline(card);
  return cardDraftSignature({ ...card, status: 'published' });
}

export async function clearPublishedBaseline(cardId: string) {
  if (!cardId) return;
  const map = await readBaselineMap();
  if (!(cardId in map)) return;
  delete map[cardId];
  await writeBaselineMap(map);
}

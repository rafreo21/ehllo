import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

export const CARD_DELETE_QUEUE_KEY = 'aftermeet.mobile.card-deletes-queue.v1';

export type CardDeleteQueueEntry = {
  cardId: string;
  cardLabel: string;
  queuedAt: string;
};

export async function readCardDeleteQueue(): Promise<CardDeleteQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CARD_DELETE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as CardDeleteQueueEntry[] : [];
  } catch {
    return [];
  }
}

async function writeCardDeleteQueue(entries: CardDeleteQueueEntry[]) {
  await AsyncStorage.setItem(CARD_DELETE_QUEUE_KEY, JSON.stringify(entries));
}

export async function enqueueCardDelete(entry: Omit<CardDeleteQueueEntry, 'queuedAt'>) {
  const current = await readCardDeleteQueue();
  const next = current.filter((item) => item.cardId !== entry.cardId);
  next.push({ ...entry, queuedAt: new Date().toISOString() });
  await writeCardDeleteQueue(next);
}

export async function dequeueCardDelete(cardId: string) {
  const current = await readCardDeleteQueue();
  await writeCardDeleteQueue(current.filter((item) => item.cardId !== cardId));
}

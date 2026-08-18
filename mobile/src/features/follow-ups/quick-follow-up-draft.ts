import { scopedStorage as AsyncStorage } from '@/lib/scoped-storage';

import type { QuickFollowUpItem, QuickFollowUpTarget } from '@/features/follow-ups/quick-follow-up-types';

export const QUICK_FOLLOW_UP_DRAFT_KEY = 'aftermeet.mobile.quick-follow-up-draft.v1';

export type QuickFollowUpDraftState = QuickFollowUpTarget & {
  followUps: QuickFollowUpItem[];
  updatedAt: string;
};

// Only one Quick Follow-up can be in progress at a time (it's a single
// screen, not a list of drafts like Capture), so this is a single slot
// rather than a keyed collection.
export async function readQuickFollowUpDraft(): Promise<QuickFollowUpDraftState | null> {
  try {
    const raw = await AsyncStorage.getItem(QUICK_FOLLOW_UP_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuickFollowUpDraftState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.followUps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeQuickFollowUpDraft(state: QuickFollowUpDraftState) {
  await AsyncStorage.setItem(QUICK_FOLLOW_UP_DRAFT_KEY, JSON.stringify(state));
}

export async function clearQuickFollowUpDraft() {
  await AsyncStorage.removeItem(QUICK_FOLLOW_UP_DRAFT_KEY);
}

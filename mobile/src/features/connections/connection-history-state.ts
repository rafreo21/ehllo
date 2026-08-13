import type { EncounterPayload } from '@/features/encounters/encounter-api';

/**
 * Quick Follow-up stores a zero-duration encounter only as a task container.
 * A notes-only Capture can also have zero duration and no recording, but it is
 * still a real conversation and must remain visible in connection History.
 */
export function isConversationEncounter(encounter: EncounterPayload) {
  const isQuickFollowUpPlaceholder = encounter.durationSeconds === 0
    && !encounter.recording
    && encounter.title.trim().toLocaleLowerCase().startsWith('follow-up with ');
  return !isQuickFollowUpPlaceholder;
}

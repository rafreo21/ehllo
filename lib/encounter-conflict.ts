/**
 * True when a caller's expected last-write timestamp doesn't match what's
 * actually stored - meaning another device wrote to this encounter since
 * the caller last read it. A caller that doesn't send expectedUpdatedAt (the
 * capture wizard's in-progress autosave, where one device owns the draft)
 * never triggers a conflict - this check is opt-in per write.
 */
export function detectEncounterConflict(
  existingUpdatedAt: string | null | undefined,
  expectedUpdatedAt: string | null | undefined,
): boolean {
  if (!expectedUpdatedAt) return false;
  if (!existingUpdatedAt) return false;
  return existingUpdatedAt !== expectedUpdatedAt;
}

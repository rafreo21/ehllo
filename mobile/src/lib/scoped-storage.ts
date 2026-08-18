import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Every device-local store in this app was keyed by name alone, with no notion
 * of which account it belonged to. Signing a second person in on the same
 * device handed them the first person's cached cards, cached follow-ups,
 * cached events, capture drafts and notification history, and replayed the
 * first person's queued scans, deletes and follow-ups under the second
 * person's session - writing one account's intent into another's workspace.
 *
 * Two problems, and the privacy one is the worse of the two: a failed publish
 * announces itself, while account B silently reading account A's data does not.
 *
 * The fix is a scope, not a cleanup. Keys are namespaced per user id, so two
 * accounts cannot name the same slot however sloppily anyone switches between
 * them - no sign-out required, and nothing to remember at each call site.
 * Purging stale namespaces is only housekeeping on top of that.
 *
 * This wraps AsyncStorage rather than editing each store because per-store
 * scoping is exactly the discipline that already failed: fifteen stores were
 * written the same way and every one of them forgot. A choke point cannot
 * forget, and stores added later inherit it without knowing it exists.
 */

/** Anything genuinely owned by the hardware, which must survive a switch. */
const DEVICE_OWNED_KEYS = new Set([
  'aftermeet.mobile.device-id.v1',
  'aftermeet-capture-device-id-v1',
  // Mirrors the OS-level permission for this install, not a per-account choice.
  'aftermeet-device-notifications-enabled-v1',
]);

/** Recognises this app's own keys so a purge never touches a library's. */
function isAppKey(key: string) {
  return key.startsWith('aftermeet');
}

const SCOPE_MARKER = '::u:';
const ANON_SCOPE = 'anon';

let currentScope: string | null = null;

export function setStorageScope(userId: string | null) {
  currentScope = userId && userId.trim() ? userId.trim() : null;
}

export function getStorageScope() {
  return currentScope;
}

function scopeSuffix() {
  return `${SCOPE_MARKER}${currentScope ?? ANON_SCOPE}`;
}

/** Device-owned keys pass through untouched; everything else gains the scope. */
export function resolveStorageKey(key: string) {
  if (DEVICE_OWNED_KEYS.has(key)) return key;
  return `${key}${scopeSuffix()}`;
}

export const scopedStorage = {
  getItem: (key: string) => AsyncStorage.getItem(resolveStorageKey(key)),
  setItem: (key: string, value: string) => AsyncStorage.setItem(resolveStorageKey(key), value),
  removeItem: (key: string) => AsyncStorage.removeItem(resolveStorageKey(key)),
};

/**
 * Removes the pre-scope keys, whoever wrote them.
 *
 * Safe to run at any time and without knowing who is signed in, because
 * nothing can read an unscoped key any more - every read now goes through
 * resolveStorageKey, which always appends a scope. Scoping alone already stops
 * one account reading another's, but it leaves the old data sitting on the
 * device; on a shared phone that is still one person's cached cards and capture
 * drafts at rest. This is what actually removes it.
 *
 * Deliberately not merged into purgeForeignScopes: that one needs to know the
 * current user, and the session resolves asynchronously, so a signed-in user
 * looks signed-out on the first render. Purging "everything not mine" in that
 * window would delete the real account's data on every launch. Legacy keys
 * carry no such ambiguity.
 */
export async function purgeLegacyUnscopedKeys() {
  let keys: readonly string[];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return { removed: 0 };
  }

  const legacy = keys.filter((key) => (
    isAppKey(key) && !DEVICE_OWNED_KEYS.has(key) && !key.includes(SCOPE_MARKER)
  ));

  if (!legacy.length) return { removed: 0 };
  try {
    await AsyncStorage.multiRemove(legacy);
  } catch {
    return { removed: 0 };
  }
  return { removed: legacy.length };
}

/**
 * Drops this app's keys that belong to any account other than the one given,
 * including the pre-scope keys written before this module existed.
 *
 * Legacy unscoped keys are deleted rather than adopted, deliberately. Their
 * owner is unknowable - that is the whole defect - so adopting them could hand
 * one person's cached cards and capture drafts to another. The cost is that the
 * caches re-fetch and any never-synced local edit or queued action from before
 * this change is dropped, which for a queued delete belonging to a different
 * account is the desired outcome anyway.
 */
export async function purgeForeignScopes(userId: string | null) {
  const scope = userId && userId.trim() ? userId.trim() : ANON_SCOPE;
  let keys: readonly string[];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return { removed: 0 };
  }

  const stale = keys.filter((key) => {
    if (!isAppKey(key) || DEVICE_OWNED_KEYS.has(key)) return false;
    const marker = key.lastIndexOf(SCOPE_MARKER);
    if (marker === -1) return true;
    return key.slice(marker + SCOPE_MARKER.length) !== scope;
  });

  if (!stale.length) return { removed: 0 };
  try {
    await AsyncStorage.multiRemove(stale);
  } catch {
    return { removed: 0 };
  }
  return { removed: stale.length };
}

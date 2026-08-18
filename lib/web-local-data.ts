/**
 * Everything the web app keeps in the browser, and how to get rid of it.
 *
 * The web consumer stores cards, contacts, encounters, campaigns and profile
 * details in localStorage so screens render instantly and survive a refresh. None
 * of it was ever scoped to an account or cleared when one changed, so it outlived
 * signing out, signing in as somebody else, and a full server-side purge - the
 * browser simply handed the old data back. Mobile had the same fault and was fixed
 * with scoped storage; the web never was.
 *
 * Keyed on who the data belongs to rather than cleared on sign-out: signing out and
 * back in as the same person should keep working offline, and it is only a
 * *different* account - or a wiped one - that must not inherit what came before.
 */
const OWNER_KEY = "ehllo-local-owner-v1";

/** Every key the web writes. Device-level preferences are deliberately excluded below. */
export const WEB_LOCAL_DATA_KEYS = [
  "aftermeet-active-campaign-v1",
  "aftermeet-active-card-v1",
  "aftermeet-campaigns-v1",
  "aftermeet-card-library-v1",
  "aftermeet-card-step-v2",
  "aftermeet-card-v2",
  "aftermeet-contacts-v1",
  "aftermeet-crm-sync-v1",
  "aftermeet-customer-discovery-v1",
  "aftermeet-encounters-v1",
  "aftermeet-last-contact-v1",
  "aftermeet-mvp-checklist-v1",
  "aftermeet-mvp-checklist-v2",
  "aftermeet-outbound-habit-v1",
  "aftermeet-private-audio",
  "aftermeet-profile-photo-v1",
  "aftermeet-profile-v1",
] as const;

/**
 * Not cleared: these describe the browser, not the person.
 *
 * The device id has to survive or every sign-in looks like a new device, and the
 * notification permission is a property of the browser somebody already granted -
 * clearing it would silently ask them again.
 */
export const DEVICE_OWNED_KEYS = [
  "aftermeet-capture-device-id-v1",
  "aftermeet-browser-notifications-v1",
  "aftermeet-shown-browser-notifications-v1",
  "aftermeet-integration-flow",
  "aftermeet-integration-state",
] as const;

/** Wipes every account-owned key. Returns how many actually held something. */
export function clearWebLocalData(): number {
  if (typeof window === "undefined") return 0;
  let cleared = 0;
  for (const key of WEB_LOCAL_DATA_KEYS) {
    if (window.localStorage.getItem(key) !== null) cleared += 1;
    window.localStorage.removeItem(key);
  }
  return cleared;
}

/**
 * Clears the browser's copy when it belongs to a different account.
 *
 * Call with the signed-in user's id as soon as it is known. The first call after
 * this ships finds no owner recorded and adopts the current one without clearing,
 * so nobody loses work simply by upgrading - the guard starts protecting from the
 * next account change onward.
 */
export function purgeWebLocalDataIfAccountChanged(userId: string): number {
  if (typeof window === "undefined" || !userId) return 0;
  const previous = window.localStorage.getItem(OWNER_KEY);
  if (previous === userId) return 0;

  const cleared = previous ? clearWebLocalData() : 0;
  window.localStorage.setItem(OWNER_KEY, userId);
  return cleared;
}

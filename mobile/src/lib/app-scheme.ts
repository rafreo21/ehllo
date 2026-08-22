import Constants from 'expo-constants';

/**
 * The URL scheme this build actually answers to.
 *
 * Deep links used to be hardcoded as `ehllo://`, which is only correct for production. The
 * staging app registers `ehllo-staging` (with `aftermeet-staging` as an inbound alias), so
 * every widget tap on a staging build fired an ACTION_VIEW that nothing could handle and
 * simply did nothing - on both platforms, silently.
 *
 * app.config.js is the single source of truth: scheme is an array whose first entry is the
 * canonical one for the variant.
 */
export function appScheme() {
  const scheme = Constants.expoConfig?.scheme;
  if (Array.isArray(scheme)) return scheme[0] || 'ehllo';
  return scheme || 'ehllo';
}

/** Builds a deep link that this build can actually open. */
export function appDeepLink(path: string, query?: string) {
  const trimmed = path.replace(/^\/+/, '');
  return query ? `${appScheme()}://${trimmed}?${query}` : `${appScheme()}://${trimmed}`;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

function readAuthCode(url: string) {
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string' && code.length > 0) return code;
  return null;
}

// Google's redirect lands with tokens directly in the URL fragment
// (#access_token=...&refresh_token=...) rather than a PKCE-style ?code=
// query param — confirmed on-device via direct URL logging on both
// platforms. Email OTP verification produces a query-param code (handled
// above); OAuth providers here use this implicit-flow shape instead, so
// both need to be checked.
function readImplicitTokens(url: string) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// Both auth codes and implicit tokens are single-use / one-shot to apply.
// On Android, the same redirect can reach the app through two independent
// channels — the browser-session promise that initiated the flow (needed
// on iOS, where ASWebAuthenticationSession only delivers the result that
// way) and the app-wide Linking "url" event (which also fires there, unlike
// on iOS). Without this guard, the second handler to run re-applies an
// already-consumed value and fails, surfacing as an error even though
// sign-in already succeeded.
let lastProcessedToken: string | null = null;

export async function completeAuthSessionFromUrl(supabase: SupabaseClient, url: string) {
  const code = readAuthCode(url);
  if (code) {
    if (code === lastProcessedToken) return { ok: true as const };
    lastProcessedToken = code;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false as const, reason: 'exchange_failed' as const, message: error.message };
    return { ok: true as const };
  }

  const tokens = readImplicitTokens(url);
  if (tokens) {
    if (tokens.access_token === lastProcessedToken) return { ok: true as const };
    lastProcessedToken = tokens.access_token;
    const { error } = await supabase.auth.setSession(tokens);
    if (error) return { ok: false as const, reason: 'exchange_failed' as const, message: error.message };
    return { ok: true as const };
  }

  return { ok: false as const, reason: 'missing_code' as const };
}

export async function readLaunchAuthUrl() {
  return Linking.getInitialURL();
}

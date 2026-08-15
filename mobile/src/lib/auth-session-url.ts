import type { SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

function readAuthCode(url: string) {
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string' && code.length > 0) return code;
  return null;
}

// OAuth codes are single-use. On Android, the same redirect can reach the
// app through two independent channels — the browser-session promise that
// initiated the flow (needed on iOS, where ASWebAuthenticationSession only
// delivers the result that way) and the app-wide Linking "url" event (which
// also fires there, unlike on iOS). Without this guard, the second handler
// to run calls exchangeCodeForSession with an already-consumed code and
// fails, surfacing as an error even though sign-in already succeeded.
let lastProcessedCode: string | null = null;

export async function completeAuthSessionFromUrl(supabase: SupabaseClient, url: string) {
  const code = readAuthCode(url);
  if (!code) return { ok: false as const, reason: 'missing_code' as const };
  if (code === lastProcessedCode) return { ok: true as const };
  lastProcessedCode = code;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { ok: false as const, reason: 'exchange_failed' as const, message: error.message };
  return { ok: true as const };
}

export async function readLaunchAuthUrl() {
  return Linking.getInitialURL();
}

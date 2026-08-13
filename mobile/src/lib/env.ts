import Constants from 'expo-constants';

import { buildMobileEmailRedirectUri, createAuthRedirectUri } from '@/lib/auth-redirect';

type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  publicCardBaseUrl: string;
  /** Empty when not configured — callers must fall back to a plain text input rather than assume autocomplete is available. */
  googlePlacesApiKey: string;
};

export function readEnv(): PublicEnv | null {
  // app.config.js's `extra` is variant-aware (production vs. staging); the
  // EXPO_PUBLIC_* env vars are only a fallback for a bare `expo start` that
  // hasn't gone through the variant-selecting config, so extra must win.
  const extra = Constants.expoConfig?.extra;
  const supabaseUrl = extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const publicCardBaseUrl = extra?.publicCardBaseUrl || process.env.EXPO_PUBLIC_CARD_BASE_URL || 'http://localhost:3000';
  const googlePlacesApiKey = extra?.googlePlacesApiKey || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return {
    supabaseUrl,
    supabaseAnonKey,
    publicCardBaseUrl: publicCardBaseUrl.replace(/\/+$/, ''),
    googlePlacesApiKey,
  };
}

export function readMobileAuthRedirectUris() {
  const env = readEnv();
  if (!env) return null;
  const nativeCallbackUri = createAuthRedirectUri();
  return {
    nativeCallbackUri,
    emailRedirectUri: buildMobileEmailRedirectUri(env.publicCardBaseUrl, nativeCallbackUri),
  };
}

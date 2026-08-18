import * as Sentry from '@sentry/react-native';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createAuthRedirectUri } from '@/lib/auth-redirect';
import { describeError } from '@/lib/friendly-error';
import { describeOtpDeliveryError } from '@/lib/otp-delivery-error';
import { completeAuthSessionFromUrl, readLaunchAuthUrl } from '@/lib/auth-session-url';
import { readMobileAuthRedirectUris } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { purgeForeignScopes, purgeLegacyUnscopedKeys, setStorageScope } from '@/lib/scoped-storage';
import { consumeAuthReturnPath, setAuthReturnPath } from '@/features/encounters/capture-draft';

type AuthValue = {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  redirectUri: string | null;
  signIn: (email: string) => Promise<{ error?: string; sent?: boolean }>;
  verifyEmailCode: (email: string, token: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  completeUseCaseSelection: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const supabase = getSupabase();
  const redirectUris = readMobileAuthRedirectUris();
  const redirectUri = redirectUris?.nativeCallbackUri ?? (supabase ? createAuthRedirectUri() : null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const sessionTimeout = setTimeout(() => setLoading(false), 5000);

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    async function handleUrl(url: string | null) {
      if (!url || !supabase) return;
      await completeAuthSessionFromUrl(supabase, url);
    }

    readLaunchAuthUrl().then(handleUrl);
    const linking = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      clearTimeout(sessionTimeout);
      data.subscription.unsubscribe();
      linking.remove();
    };
  }, [supabase]);

  // Point every device-local store at this account before anything reads one.
  // Device-local caches and queues used to be keyed by name alone, so a second
  // account on the same device read the first account's cached cards, capture
  // drafts and notification history, and replayed its queued scans, deletes and
  // follow-ups under the new session.
  //
  // Scoping is what actually fixes that: two accounts can no longer name the
  // same slot, so it holds however untidily someone switches - no clean
  // sign-out needed, which matters because reinstalls and expired sessions skip
  // sign-out entirely. Keyed on user id rather than a sign-out hook for exactly
  // that reason.
  const storageScopeRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    setStorageScope(userId);
    if (!userId || storageScopeRef.current === userId) return;
    storageScopeRef.current = userId;
    // Housekeeping on top of the scope: drop namespaces belonging to other
    // accounts now that we know which one is ours.
    void purgeForeignScopes(userId);
  }, [session?.user?.id]);

  // The pre-scope keys are unreadable the moment this ships, but they are still
  // one person's cached cards and capture drafts sitting on the device. Clear
  // them once per install, without waiting for a sign-in that may never come:
  // an app left signed out would otherwise keep the previous account's data at
  // rest indefinitely.
  useEffect(() => {
    void purgeLegacyUnscopedKeys();
  }, []);

  const provisionedForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase || !session) {
      provisionedForUserId.current = null;
      return;
    }
    if (provisionedForUserId.current === session.user.id) return;
    provisionedForUserId.current = session.user.id;

    supabase.rpc('provision_personal_workspace').then(({ data }) => {
      void supabase.rpc('link_people_connections_for_email');
      const onboardingStatus = Array.isArray(data) ? data[0]?.onboarding_status : undefined;
      void consumeAuthReturnPath().then((path) => {
        if (onboardingStatus && onboardingStatus !== 'completed') {
          if (path) void setAuthReturnPath(path);
          router.replace('/onboarding/use-case');
        } else if (path) {
          router.replace(path as '/capture');
        } else {
          router.replace('/(tabs)');
        }
      });
    });
  }, [session, supabase]);

  useEffect(() => {
    Sentry.setUser(session?.user ? { id: session.user.id } : null);
  }, [session?.user]);

  const value = useMemo<AuthValue>(() => ({
    session,
    loading,
    configured: Boolean(supabase),
    redirectUri,
    signIn: async (email) => {
      if (!supabase) return { error: 'Connect the mobile environment to Supabase first.' };
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      return error ? { error: describeOtpDeliveryError(error) } : { sent: true };
    },
    verifyEmailCode: async (email, token) => {
      if (!supabase) return { error: 'Connect the mobile environment to Supabase first.' };
      const cleaned = token.replace(/\D/g, '');
      if (cleaned.length !== 6) return { error: 'Enter the 6-digit code from your email.' };
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: cleaned,
        type: 'email',
      });
      return error ? { error: describeError(error, 'Could not verify this code.') } : {};
    },
    signInWithGoogle: async () => {
      if (!supabase) return { error: 'Connect the mobile environment to Supabase first.' };
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUri ?? undefined, skipBrowserRedirect: true },
      });
      if (error || !data?.url) return { error: describeError(error, 'Could not start Google sign-in.') };
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri ?? undefined);
      if (result.type !== 'success' || !result.url) return {};
      const outcome = await completeAuthSessionFromUrl(supabase, result.url);
      if (!outcome.ok) {
        return { error: outcome.reason === 'exchange_failed' ? describeError(new Error(outcome.message), 'Could not complete Google sign-in.') : 'Could not complete Google sign-in.' };
      }
      return {};
    },
    signOut: async () => {
      await supabase?.auth.signOut();
      // The scope is what protects the data; clearing it just stops the
      // signed-out session writing into the account's namespace.
      setStorageScope(null);
    },
    completeUseCaseSelection: async () => {
      await supabase?.rpc('complete_use_case_selection');
    },
  }), [session, loading, supabase, redirectUri]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

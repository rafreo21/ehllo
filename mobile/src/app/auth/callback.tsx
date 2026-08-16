import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { completeAuthSessionFromUrl } from '@/lib/auth-session-url';
import { getSupabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme/tokens';

export default function AuthCallbackScreen() {
  // useLocalSearchParams only sees query params, not a #fragment — Google's
  // redirect lands with tokens in the fragment (see auth-session-url.ts), so
  // this needs the raw incoming URL, not expo-router's parsed params.
  const url = Linking.useLinkingURL();
  const [message, setMessage] = useState('Finishing sign-in…');

  useEffect(() => {
    let active = true;

    async function finish() {
      const supabase = getSupabase();
      if (!supabase) {
        if (active) setMessage('Supabase is not configured.');
        return;
      }
      if (!url) {
        if (active) setMessage('No sign-in code found. Request a new link or enter the 6-digit code.');
        return;
      }

      const outcome = await completeAuthSessionFromUrl(supabase, url);
      if (!active) return;

      if (!outcome.ok) {
        setMessage(outcome.reason === 'exchange_failed' ? outcome.message : 'No sign-in code found. Request a new link or enter the 6-digit code.');
        return;
      }

      router.replace('/(tabs)');
    }

    finish();
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x4, backgroundColor: colors.canvas, padding: spacing.x5 },
  message: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
});

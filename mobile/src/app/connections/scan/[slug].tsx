import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionDetailSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { connectionFromScannedSlug } from '@/features/connections/connections-api';
import { colors } from '@/theme/tokens';

export default function ScanCompleteScreen() {
  const { slug, source } = useLocalSearchParams<{ slug: string; source?: string }>();
  const { session } = useAuth();

  useEffect(() => {
    const normalized = typeof slug === 'string' ? slug.trim().toLowerCase() : '';
    if (!normalized) {
      router.replace('/connections');
      return;
    }
    if (!session?.access_token) {
      router.replace('/auth');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const scanSource = source === 'nfc' ? 'nfc' : 'link';
        const result = await connectionFromScannedSlug(session.access_token, normalized, undefined, scanSource);
        if (cancelled) return;
        if (result) {
          // Carries the outcome onward so the profile can say which of the two things
          // just happened. Arriving with no word either way is what made scanning a
          // wallet pass feel like nothing had happened at all.
          const outcome = result.alreadyConnected ? 'known' : 'added';
          router.replace(`/connections/${encodeURIComponent(result.connection.id)}?scan=${outcome}`);
          return;
        }
        router.replace('/connections');
      } catch {
        if (!cancelled) router.replace('/connections');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, slug, source]);

  return (
    <View style={styles.container}>
      <ConnectionDetailSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
});

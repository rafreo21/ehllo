import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionDetailSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { connectionFromScannedSlug } from '@/features/connections/connections-api';
import { colors } from '@/theme/tokens';

export default function ScanCompleteScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
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
        const result = await connectionFromScannedSlug(session.access_token, normalized);
        if (cancelled) return;
        if (result) {
          router.replace(`/connections/${encodeURIComponent(result.connection.id)}`);
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
  }, [session?.access_token, slug]);

  return (
    <View style={styles.container}>
      <ConnectionDetailSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
});

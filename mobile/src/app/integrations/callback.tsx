import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing, fonts } from '@/theme/tokens';

export default function IntegrationsCallbackScreen() {
  const params = useLocalSearchParams<{ integration?: string | string[] }>();

  useEffect(() => {
    router.replace({
      pathname: '/settings/connected-accounts',
      params: {
        integration: Array.isArray(params.integration) ? params.integration[0] : params.integration,
      },
    });
  }, [params.integration]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.message}>Finishing account connection…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x4,
    backgroundColor: colors.canvas,
    padding: spacing.x5,
  },
  message: { fontFamily: fonts.regular, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});

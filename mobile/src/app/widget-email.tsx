import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, EnvelopeSimple } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { buildFollowUpEmailBody } from '@/features/follow-ups/action-links';
import { openEmailCompose } from '@/lib/email-compose';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

export default function WidgetEmailScreen() {
  const params = useLocalSearchParams<{ to?: string; name?: string; event?: string }>();
  const launched = useRef(false);
  const [error, setError] = useState('');
  const to = typeof params.to === 'string' ? params.to.trim() : '';
  const name = typeof params.name === 'string' ? params.name.trim() : '';
  const event = typeof params.event === 'string' ? params.event.trim() : '';

  async function compose() {
    if (!to) {
      setError('This connection does not have an email address.');
      return;
    }
    setError('');
    try {
      await openEmailCompose({
        to,
        subject: 'Great meeting you',
        body: buildFollowUpEmailBody(name, event || undefined),
      });
    } catch {
      setError('No email app could open this message. Add an email account, then try again.');
    }
  }

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    void compose();
    // The values are the immutable payload for this route. compose intentionally runs once;
    // returning from Mail must not open a second draft automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.page}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
        <ArrowLeft size={20} color={colors.ink} weight="bold" />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.icon}><EnvelopeSimple size={28} color={colors.ink} /></View>
        <Text style={styles.title}>{error ? 'Email could not open' : 'Opening your email'}</Text>
        <Text style={styles.copy}>
          {error || `Preparing your follow-up${name ? ` to ${name}` : ''}.`}
        </Text>
        {error ? (
          <Pressable accessibilityRole="button" onPress={() => void compose()} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        ) : <ActivityIndicator color={colors.ink} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas, padding: spacing.x5 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x3, paddingHorizontal: spacing.x5 },
  icon: { width: 64, height: 64, borderRadius: radius.large, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontFamily: fonts.medium, fontSize: 24, textAlign: 'center' },
  copy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  button: { minHeight: 44, paddingHorizontal: spacing.x5, borderRadius: radius.medium, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: spacing.x2 },
  buttonText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 16 },
});

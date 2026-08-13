import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/ui';
import type { EventItem } from '@/features/events/events-api';
import { colors, radius, spacing } from '@/theme/tokens';

export function EventInviteSheet({
  event,
  loading,
  error,
  onClose,
  onInvite,
}: {
  event: EventItem | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onInvite: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <BottomSheet visible={Boolean(event)} title="Invite someone" onClose={onClose}>
      <View style={styles.copy}>
        <Text style={styles.eventTitle}>{event?.title}</Text>
        <Text style={styles.hint}>They can view the event and RSVP without creating an account. If they sign up later, this same event and response move with them.</Text>
      </View>
      <TextInput
        accessibilityLabel="Guest email address"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="guest@example.com"
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button disabled={!valid || loading} loading={loading} onPress={() => onInvite(email.trim().toLowerCase())}>
        Send invitation
      </Button>
      <Text style={styles.privacy}>Their RSVP is private. Your captures, recordings and notes stay private too.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing.x2 },
  eventTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  input: { minHeight: 52, paddingHorizontal: spacing.x4, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, color: colors.ink, backgroundColor: colors.canvas },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});

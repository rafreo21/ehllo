import { router } from 'expo-router';
import { CheckCircle, Envelope, IdentificationBadge, ShieldCheck } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { PhoneInput } from '@/components/phone-input';
import { SettingsSkeleton } from '@/components/skeleton';
import { Body, Button, Panel, PageHeader, Screen } from '@/components/ui';
import {
  fetchAccountProfile,
  updateAccountProfile,
  type AccountProfile,
} from '@/features/account/account-api';
import { describeError } from '@/lib/friendly-error';
import { colors, radius, spacing } from '@/theme/tokens';

export default function EditProfileScreen() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorOpen, setErrorOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [verifyNoticeOpen, setVerifyNoticeOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAccountProfile()
      .then((result) => {
        if (cancelled || !result) return;
        setProfile(result);
        setDisplayName(result.displayName);
        setPhone(result.phone);
      })
      .catch((caught) => {
        if (cancelled) return;
        setErrorMessage(describeError(caught, 'Could not load your account.'));
        setErrorOpen(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const updated = await updateAccountProfile({ displayName, phone });
      setProfile((current) => current && {
        ...current,
        displayName: updated.displayName,
        phone: updated.phone,
        phoneVerified: updated.phoneVerified,
      });
      setSuccessOpen(true);
    } catch (caught) {
      setErrorMessage(describeError(caught, 'Could not save your account details.'));
      setErrorOpen(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      header={
        <PageHeader
          eyebrow="My account"
          title="Edit profile"
          onBack={() => router.back()}
        />
      }
      footer={loading ? undefined : (
        <Button onPress={() => void save()} loading={saving}>
          Save changes
        </Button>
      )}>
      {loading ? (
        <SettingsSkeleton />
      ) : (
        <View style={styles.content}>
          <Body>
            Account details only. Your public card is edited from My Cards.
          </Body>

          <Panel style={styles.panel}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <View style={styles.inputRow}>
                <IdentificationBadge size={18} color={colors.muted} weight="bold" />
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your full name"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.inputRow}>
                <Envelope size={18} color={colors.muted} weight="bold" />
                <Text style={styles.readOnlyValue} numberOfLines={1}>{profile?.primaryEmail || 'N/A'}</Text>
                {profile?.emailVerified ? (
                  <View style={styles.verifiedTag}>
                    <CheckCircle size={13} color={colors.ink} weight="fill" />
                    <Text style={styles.verifiedTagText}>Verified</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.fieldHint}>Confirmed every time you sign in with an email code.</Text>
            </View>

            <View style={styles.field}>
              <PhoneInput label="Phone number" value={phone} onChange={setPhone} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={profile?.phoneVerified ? 'Phone number verified' : 'Verify phone number'}
                disabled={profile?.phoneVerified}
                onPress={() => setVerifyNoticeOpen(true)}
                style={({ pressed }) => [
                  styles.verifyButton,
                  profile?.phoneVerified && styles.verifyButtonDone,
                  pressed && !profile?.phoneVerified && styles.verifyButtonPressed,
                ]}>
                {profile?.phoneVerified ? (
                  <CheckCircle size={20} color={colors.ink} weight="fill" />
                ) : (
                  <ShieldCheck size={20} color={colors.ink} weight="bold" />
                )}
                <Text style={styles.verifyButtonText}>
                  {profile?.phoneVerified ? 'Verified' : 'Verify'}
                </Text>
              </Pressable>
              <Text style={styles.fieldHint}>
                {profile?.phoneVerified ? 'This number is verified.' : 'Save your number, then tap verify.'}
              </Text>
            </View>
          </Panel>
        </View>
      )}

      <OutcomeSuccessSheet
        visible={successOpen}
        message="Your account details are saved."
        onClose={() => setSuccessOpen(false)}
      />
      <OutcomeErrorSheet
        visible={errorOpen}
        message={errorMessage}
        onClose={() => setErrorOpen(false)}
      />

      <BottomSheet
        visible={verifyNoticeOpen}
        title="Phone verification"
        onClose={() => setVerifyNoticeOpen(false)}>
        <Body>
          Phone verification is coming soon. Save your number now, and you&apos;ll be able to confirm it here as soon as it&apos;s ready.
        </Body>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.x4 },
  panel: { gap: spacing.x4 },
  field: { gap: spacing.x2 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldHint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  inputRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    paddingHorizontal: spacing.x3,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  input: { flex: 1, color: colors.ink, fontSize: 15 },
  readOnlyValue: { flex: 1, color: colors.ink, fontSize: 15 },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.x2,
    paddingVertical: 4,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  verifiedTagText: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  verifyButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  verifyButtonText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  verifyButtonPressed: { opacity: 0.8 },
  verifyButtonDone: { backgroundColor: colors.accent, borderColor: colors.accent },
});

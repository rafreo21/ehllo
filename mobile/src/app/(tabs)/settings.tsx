import { router } from 'expo-router';
import { Bell, CalendarBlank, CaretRight, CloudArrowUp, DeviceMobile, IdentificationBadge, ListChecks, Microphone, Plugs, Scan, UsersThree } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/bottom-sheet';
import { QuickActionsFab } from '@/components/quick-actions-fab';
import { Body, Button, Eyebrow, Panel, Screen, Title } from '@/components/ui';
import { SettingsSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { fetchConnectedAccounts, type ConnectedAccountStatus } from '@/features/integrations/integrations-api';
import { deactivatePushToken } from '@/features/notifications/push-token-service';
import {
  readRecordingStorageDestination,
  recordingStorageDestinationLabel,
  writeRecordingStorageDestination,
  type RecordingStorageDestination,
} from '@/lib/recording-storage-preference';
import { colors, radius, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { session, configured, signOut, loading } = useAuth();
  const [recordingDestination, setRecordingDestination] = useState<RecordingStorageDestination>('local_only');
  const [recordingSheetOpen, setRecordingSheetOpen] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<ConnectedAccountStatus | null>(null);

  useEffect(() => {
    void readRecordingStorageDestination().then(setRecordingDestination);
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void fetchConnectedAccounts(session.access_token).then(setIntegrationStatus).catch(() => undefined);
  }, [session?.access_token]);

  async function selectRecordingDestination(destination: RecordingStorageDestination) {
    setRecordingDestination(destination);
    await writeRecordingStorageDestination(destination);
  }

  function openConnectedAccounts() {
    setRecordingSheetOpen(false);
    router.push('/settings/connected-accounts');
  }

  if (loading) {
    return (
      <Screen>
        <SettingsSkeleton />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Screen
        contentContainerStyle={styles.scrollContent}
        header={
          <View style={styles.header}>
            <Eyebrow>AfterMeet mobile</Eyebrow>
            <Title style={styles.title}>My Profile</Title>
            <Body>Manage your account, synchronization and mobile capabilities.</Body>
          </View>
        }>
        <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/edit-profile')}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <IdentificationBadge size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>Edit profile</Text>
          </View>
          <Text style={styles.linkHint}>Full name, email, and phone number</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/follow-ups')}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <ListChecks size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>Follow-ups</Text>
          </View>
          <Text style={styles.linkHint}>Current actions and completed follow-ups</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/capture')}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <Microphone size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>Capture context</Text>
          </View>
          <Text style={styles.linkHint}>Recordings, drafts, and captures needing review</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/events')}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <CalendarBlank size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>My events</Text>
          </View>
          <Text style={styles.linkHint}>Events you&apos;re going to, and ones from your calendar</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/recent-scans')}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <Scan size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>Recent scans</Text>
          </View>
          <Text style={styles.linkHint}>People who scanned your card but aren&apos;t saved yet</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/connections')}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <UsersThree size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>My connections</Text>
          </View>
          <Text style={styles.linkHint}>People you&apos;ve met and cards you&apos;ve saved</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/connected-accounts')}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <Plugs size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>Connected accounts</Text>
          </View>
          <Text style={styles.linkHint}>Google, Microsoft, and future integrations</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      {session ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/notifications')}
          style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
          <View style={styles.linkCopy}>
            <View style={styles.linkTitleRow}>
              <Bell size={18} color={colors.ink} weight="bold" />
              <Text style={styles.label}>Notification preferences</Text>
            </View>
            <Text style={styles.linkHint}>How AfterMeet reminds you about follow-ups</Text>
          </View>
          <CaretRight size={18} color={colors.muted} weight="bold" />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setRecordingSheetOpen(true)}
        style={({ pressed }) => [styles.linkPanel, pressed && styles.linkPanelPressed]}>
        <View style={styles.linkCopy}>
          <View style={styles.linkTitleRow}>
            <CloudArrowUp size={18} color={colors.ink} weight="bold" />
            <Text style={styles.label}>Recording storage</Text>
          </View>
          <Text style={styles.linkHint}>{recordingStorageDestinationLabel(recordingDestination)}</Text>
        </View>
        <CaretRight size={18} color={colors.muted} weight="bold" />
      </Pressable>

      <BottomSheet
        visible={recordingSheetOpen}
        title="Recording storage"
        onClose={() => setRecordingSheetOpen(false)}>
        <Text style={styles.linkHint}>Where new recordings are stored. Doesn&apos;t affect guest sharing.</Text>
        <View style={styles.recordingOptions}>
          {([
            { id: 'local_only' as const, label: 'Only on this device', detail: 'Private local copy', icon: DeviceMobile, ready: true },
            {
              id: 'google_drive' as const,
              label: 'Google Drive',
              detail: integrationStatus?.google.connected && integrationStatus.google.capabilities.drive
                ? 'Uses your connected Google account'
                : 'Tap to connect Google',
              icon: CloudArrowUp,
              ready: Boolean(integrationStatus?.google.connected && integrationStatus.google.capabilities.drive),
            },
            {
              id: 'onedrive' as const,
              label: 'OneDrive',
              detail: integrationStatus?.microsoft.connected && integrationStatus.microsoft.capabilities.onedrive
                ? 'Uses your connected Microsoft account'
                : 'Tap to connect Microsoft',
              icon: CloudArrowUp,
              ready: Boolean(integrationStatus?.microsoft.connected && integrationStatus.microsoft.capabilities.onedrive),
            },
          ]).map((option) => {
            const selected = recordingDestination === option.id;
            const Icon = option.icon;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => (option.ready ? void selectRecordingDestination(option.id) : openConnectedAccounts())}
                style={[styles.recordingOption, selected && styles.recordingOptionActive]}>
                <Icon size={18} color={colors.ink} weight="bold" />
                <View style={styles.recordingOptionCopy}>
                  <Text style={styles.recordingOptionLabel}>{option.label}</Text>
                  <Text style={styles.recordingOptionDetail}>{option.detail}</Text>
                </View>
                {option.ready ? (
                  <View style={[styles.recordingOptionRadio, selected && styles.recordingOptionRadioActive]} />
                ) : (
                  <CaretRight size={16} color={colors.muted} weight="bold" />
                )}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      <Panel>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{session?.user.email || 'Preview mode'}</Text>
        <Text style={styles.hint}>
          {configured ? session ? 'Secure session active' : 'Supabase connected · sign in to sync' : 'Add the mobile environment variables to enable sync'}
        </Text>
      </Panel>
      {!session ? (
        <Button onPress={() => router.push('/auth')}>Sign in or sign up</Button>
      ) : (
        <Button
          variant="secondary"
          onPress={() => {
            if (session.access_token) void deactivatePushToken(session.access_token);
            signOut();
          }}>
          Sign out
        </Button>
      )}
      </Screen>

      <QuickActionsFab />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: spacing.x3 + 56 + spacing.x4 },
  header: { gap: spacing.x3 },
  title: { fontSize: 30, lineHeight: 32 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  value: { marginTop: 8, color: colors.ink, fontSize: 17, fontWeight: '800' },
  hint: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18 },
  linkPanel: {
    minHeight: 72,
    padding: spacing.x5,
    borderRadius: 16,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.x3,
  },
  linkPanelPressed: { opacity: 0.82 },
  linkCopy: { flex: 1, gap: 6 },
  linkTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  linkHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  recordingOptions: { gap: spacing.x2, marginTop: spacing.x3 },
  recordingOption: {
    minHeight: 64,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
  },
  recordingOptionActive: { borderColor: colors.ink, backgroundColor: colors.surfaceMuted },
  recordingOptionCopy: { flex: 1, minWidth: 0 },
  recordingOptionLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  recordingOptionDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  recordingOptionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  recordingOptionRadioActive: { borderColor: colors.ink, backgroundColor: colors.accent },
});

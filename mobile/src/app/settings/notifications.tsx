import { Bell, CalendarCheck, CaretRight, CheckCircle, ClockCounterClockwise, EnvelopeSimple, HandWaving, ShareNetwork, UsersThree } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { ChoicePill, PageHeader, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { getSupabase } from '@/lib/supabase';
import { fetchFollowUps } from '@/features/follow-ups/follow-up-api';
import {
  deviceNotificationsEnabled,
  followUpReminderTimes,
  notificationPermissionGranted,
  REMINDER_TIME_OPTIONS,
  requestNotificationPermission,
  setDeviceNotificationsEnabled,
  setFollowUpReminderTimes,
  syncFollowUpNotifications,
  type ReminderTime,
} from '@/features/notifications/notification-service';
import {
  deactivatePushToken,
  registerPushToken,
} from '@/features/notifications/push-token-service';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
  type NotificationType,
} from '@/features/notifications/notification-center-api';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

const NOTIFICATION_TYPE_ROWS: { type: NotificationType; icon: typeof Bell; label: string; hint: string }[] = [
  { type: 'review_ready', icon: CheckCircle, label: 'Transcript ready', hint: 'A capture is ready for your review' },
  { type: 'follow_up_due', icon: CalendarCheck, label: 'Follow-up due', hint: 'A reviewed follow-up is due today' },
  { type: 'follow_up_overdue', icon: ClockCounterClockwise, label: 'Follow-up overdue', hint: 'A reviewed follow-up is overdue' },
  { type: 'shared_meeting_update', icon: ShareNetwork, label: 'Shared meeting updates', hint: 'A guest commits to their own follow-up' },
  { type: 'connection_added', icon: UsersThree, label: 'New connections', hint: 'Someone connects with you by scanning your card' },
  { type: 'keep_in_touch', icon: HandWaving, label: 'Keep in touch nudges', hint: 'A gentle reminder to reach out after you connect' },
  { type: 'contact_request', icon: EnvelopeSimple, label: 'Contact requests', hint: 'Someone asks you for a phone number or email' },
  { type: 'follow_up_completed', icon: CheckCircle, label: 'Follow-up completed', hint: 'The other person ticks off a follow-up you share' },
];

export default function NotificationPreferencesScreen() {
  const { session } = useAuth();
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [remindersSaving, setRemindersSaving] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [devicePermission, setDevicePermission] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [pushActive, setPushActive] = useState(false);
  const [reminderTimes, setReminderTimes] = useState<ReminderTime[]>(['09:00']);
  const [reminderTimeSheetOpen, setReminderTimeSheetOpen] = useState(false);
  const [typePreferences, setTypePreferences] = useState<NotificationPreferences | null>(null);
  const [typePreferencesSaving, setTypePreferencesSaving] = useState<NotificationType | null>(null);
  const [notifyAboutSheetOpen, setNotifyAboutSheetOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    const supabase = getSupabase();
    void supabase?.rpc('get_my_reminder_preference').then(({ data }) => {
      if (typeof data === 'boolean') setRemindersEnabled(data);
    });
  }, [session]);

  useEffect(() => {
    if (!session?.access_token) {
      void Promise.resolve().then(() => setTypePreferences(null));
      return;
    }
    void fetchNotificationPreferences(session.access_token).then(setTypePreferences).catch(() => undefined);
  }, [session]);

  async function toggleNotificationType(type: NotificationType, value: boolean) {
    if (!session?.access_token || !typePreferences) return;
    const next = { ...typePreferences, [type]: value };
    setTypePreferences(next);
    setTypePreferencesSaving(type);
    try {
      await updateNotificationPreferences(session.access_token, next);
    } catch {
      setTypePreferences(typePreferences);
    } finally {
      setTypePreferencesSaving(null);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      deviceNotificationsEnabled(),
      notificationPermissionGranted(),
      followUpReminderTimes(),
    ]).then(async ([enabled, granted, storedReminderTimes]) => {
      if (!active) return;
      setDeviceEnabled(enabled && granted);
      setDevicePermission(granted);
      setReminderTimes(storedReminderTimes);
      if (enabled && granted && session?.access_token) {
        const registered = await registerPushToken(session.access_token);
        if (active) setPushActive(registered);
      } else {
        setPushActive(false);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session?.access_token]);

  /**
   * Turns one time on or off, keeping at least one selected.
   *
   * Tapping the only selected time is a no-op rather than an empty set: no times
   * at all looks identical to reminders being broken, and the switch above this
   * sheet is what turns them off.
   */
  async function toggleReminderTime(value: ReminderTime) {
    const next = reminderTimes.includes(value)
      ? reminderTimes.filter((time) => time !== value)
      : REMINDER_TIME_OPTIONS.filter((option) => option === value || reminderTimes.includes(option));
    if (!next.length) return;
    setReminderTimes(next);
    await setFollowUpReminderTimes(next);
    if (deviceEnabled && session?.access_token) {
      const followUps = await fetchFollowUps(session.access_token);
      await syncFollowUpNotifications(followUps);
    }
  }

  async function toggleReminders(value: boolean) {
    setRemindersEnabled(value);
    setRemindersSaving(true);
    try {
      const supabase = getSupabase();
      await supabase?.rpc('set_reminder_email_preference', { p_enabled: value });
    } catch {
      setRemindersEnabled(!value);
    } finally {
      setRemindersSaving(false);
    }
  }

  async function toggleDeviceNotifications(value: boolean) {
    setDeviceSaving(true);
    setNotificationMessage('');
    try {
      if (!value) {
        await setDeviceNotificationsEnabled(false);
        setDeviceEnabled(false);
        setPushActive(false);
        if (session?.access_token) void deactivatePushToken(session.access_token);
        return;
      }

      const granted = await requestNotificationPermission();
      setDevicePermission(granted);
      if (!granted) {
        setDeviceEnabled(false);
        setNotificationMessage('Notifications are blocked. Enable them for ehllo in your device settings.');
        return;
      }

      await setDeviceNotificationsEnabled(true);
      setDeviceEnabled(true);
      let registered = false;
      if (session?.access_token) {
        const followUps = await fetchFollowUps(session.access_token);
        await syncFollowUpNotifications(followUps);
        registered = await registerPushToken(session.access_token);
        setPushActive(registered);
      }
      setNotificationMessage(registered ? 'Device reminders and background alerts are on.' : 'Device reminders are on.');
    } catch {
      setDeviceEnabled(false);
      setNotificationMessage('Could not enable device reminders. Please try again.');
    } finally {
      setDeviceSaving(false);
    }
  }

  const header = <PageHeader title="Notification preferences" />;

  if (!session) {
    return (
      <Screen header={header}>
        <Panel>
          <Text style={styles.preferenceTitle}>Sign in required</Text>
          <Text style={styles.linkHint}>Sign in to choose how ehllo reminds you about follow-ups.</Text>
        </Panel>
      </Screen>
    );
  }

  const enabledTypeCount = typePreferences
    ? Object.values(typePreferences).filter(Boolean).length
    : NOTIFICATION_TYPE_ROWS.length;

  return (
    <Screen header={header}>
      <Panel style={styles.card}>
        <View style={styles.reminderRow}>
          <View style={styles.linkCopy}>
            <View style={styles.linkTitleRow}>
              <EnvelopeSimple size={18} color={colors.ink} weight="bold" />
              <Text style={styles.preferenceTitle}>Email reminders</Text>
            </View>
            <Text style={styles.linkHint}>Email me when a follow-up becomes overdue</Text>
          </View>
          <Switch
            accessibilityLabel="Email me about overdue follow-ups"
            value={remindersEnabled}
            disabled={remindersSaving}
            onValueChange={(value) => void toggleReminders(value)}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.white}
          />
        </View>
      </Panel>

      <Panel style={styles.card}>
        <View style={styles.reminderRow}>
          <View style={styles.linkCopy}>
            <View style={styles.linkTitleRow}>
              <Bell size={18} color={colors.ink} weight="bold" />
              <Text style={styles.preferenceTitle}>Device notifications</Text>
            </View>
            <Text style={styles.linkHint}>Remind me on this phone when my follow-ups are due</Text>
          </View>
          <Switch
            accessibilityLabel="Device follow-up notifications"
            value={deviceEnabled}
            disabled={deviceSaving}
            onValueChange={(value) => void toggleDeviceNotifications(value)}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.white}
          />
        </View>
        {notificationMessage ? (
          <View style={styles.statusRow}>
            <Text style={[styles.statusMessage, !devicePermission && styles.statusError]}>
              {notificationMessage}
            </Text>
            {!devicePermission ? (
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
                <Text style={styles.settingsLink}>Open device settings</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Panel>

      {deviceEnabled ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setReminderTimeSheetOpen(true)}
          style={({ pressed }) => [styles.card, styles.trigger, pressed && styles.pressed]}>
          <View style={styles.linkCopy}>
            <Text style={styles.preferenceTitle}>Reminder times</Text>
            <Text style={styles.linkHint}>{reminderTimes.join(' · ')} daily</Text>
          </View>
          <CaretRight size={18} color={colors.muted} weight="bold" />
        </Pressable>
      ) : null}

      {typePreferences ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setNotifyAboutSheetOpen(true)}
          style={({ pressed }) => [styles.card, styles.trigger, pressed && styles.pressed]}>
          <View style={styles.linkCopy}>
            <Text style={styles.preferenceTitle}>Notify me about</Text>
            <Text style={styles.linkHint}>{enabledTypeCount} of {NOTIFICATION_TYPE_ROWS.length} on</Text>
          </View>
          <CaretRight size={18} color={colors.muted} weight="bold" />
        </Pressable>
      ) : null}

      <BottomSheet
        visible={reminderTimeSheetOpen}
        title="Reminder times"
        onClose={() => setReminderTimeSheetOpen(false)}>
        <Text style={styles.sheetHint}>
          Pick every time you want to be nudged. A follow-up due that day pings at each one.
        </Text>
        <View style={styles.reminderTimeOptions}>
          {REMINDER_TIME_OPTIONS.map((option) => (
            <ChoicePill
              key={option}
              label={option}
              selected={reminderTimes.includes(option)}
              onPress={() => void toggleReminderTime(option)}
              accessibilityLabel={`${option} reminder, ${reminderTimes.includes(option) ? 'on' : 'off'}`}
            />
          ))}
        </View>
        <Text style={styles.linkHint}>
          {pushActive ? 'Background alerts are on.' : 'Reminders work while ehllo is open or recently used.'}
        </Text>
      </BottomSheet>

      <BottomSheet
        visible={notifyAboutSheetOpen}
        title="Notify me about"
        onClose={() => setNotifyAboutSheetOpen(false)}>
        {typePreferences ? NOTIFICATION_TYPE_ROWS.map((row) => (
          <View key={row.type} style={styles.reminderRow}>
            <View style={styles.linkCopy}>
              <View style={styles.linkTitleRow}>
                <row.icon size={18} color={colors.ink} weight="bold" />
                <Text style={styles.preferenceTitle}>{row.label}</Text>
              </View>
              <Text style={styles.linkHint}>{row.hint}</Text>
            </View>
            <Switch
              accessibilityLabel={row.label}
              value={typePreferences[row.type]}
              disabled={typePreferencesSaving === row.type}
              onValueChange={(value) => void toggleNotificationType(row.type, value)}
              trackColor={{ false: colors.line, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>
        )) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82 },
  card: { gap: spacing.x3 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.x5,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 },
  preferenceTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
  reminderTimeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2, marginBottom: spacing.x3 },
  sheetHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginBottom: spacing.x3 },
  statusMessage: { color: colors.ink, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  statusError: { color: colors.danger },
  statusRow: { gap: spacing.x2 },
  settingsLink: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800', textDecorationLine: 'underline' },
  linkCopy: { flex: 1, gap: 6 },
  linkTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  linkHint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});

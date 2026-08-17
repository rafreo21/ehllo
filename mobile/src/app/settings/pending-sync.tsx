import { useFocusEffect } from 'expo-router';
import { ArrowsClockwise, CalendarCheck, CheckCircle, IdentificationCard, ListChecks, Microphone, Scan } from 'phosphor-react-native';
import LottieView from 'lottie-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, PageHeader, Panel, Screen } from '@/components/ui';
import { PendingSyncSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { readPendingSyncStatus, type PendingSyncStatus } from '@/features/sync/pending-sync-status';
import { useOtherDevicesPendingCount } from '@/features/sync/use-other-devices-pending';
import { requestForegroundSync } from '@/lib/background-sync';
import { useIsOnline } from '@/lib/connectivity';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, spacing } from '@/theme/tokens';

const EMPTY_STATUS: PendingSyncStatus = {
  scans: [], quickFollowUps: [], followUpActions: [], transcriptions: [], eventActions: [],
  cardChanges: [], cardDeletes: [], items: [], total: 0,
};

export default function PendingSyncScreen() {
  const { session } = useAuth();
  const online = useIsOnline();
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const showLottie = useDeferredMount(true);
  const otherDevicesPending = useOtherDevicesPendingCount(status.total);

  const refresh = useCallback(async () => {
    setStatus(await readPendingSyncStatus());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 2_000);
    return () => clearInterval(interval);
  }, [refresh]));

  async function retryNow() {
    setRetrying(true);
    await requestForegroundSync();
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  }

  const rows = [
    { key: 'scans', icon: Scan, label: 'Connection scans', count: status.scans.length, detail: 'Cards waiting to be added to Connections' },
    { key: 'quick', icon: ListChecks, label: 'Quick follow-ups', count: status.quickFollowUps.length, detail: 'Follow-ups waiting to be created' },
    { key: 'actions', icon: CheckCircle, label: 'Follow-up changes', count: status.followUpActions.length, detail: 'Complete, reopen, snooze, or dismiss changes' },
    { key: 'transcriptions', icon: Microphone, label: 'Transcriptions', count: status.transcriptions.length, detail: 'Local recordings waiting for transcription' },
    { key: 'events', icon: CalendarCheck, label: 'Event attendance', count: status.eventActions.length, detail: 'Going, Not going, or I’ve left changes' },
    { key: 'cards', icon: IdentificationCard, label: 'Cards', count: status.cardChanges.length + status.cardDeletes.length, detail: 'Card edits and deletes waiting to sync' },
  ];

  const retryFooter = (
    <View style={styles.retryFooter}>
      <Button
        disabled={!online || !session?.access_token || status.total === 0}
        loading={retrying}
        onPress={() => void retryNow()}>
        <ArrowsClockwise size={18} color={colors.white} weight="bold" />
        Retry now
      </Button>
      {!session ? <Text style={styles.note}>Sign in before queued work can sync.</Text> : null}
      {!online ? <Text style={styles.note}>Reconnect to the internet, then ehllo will retry automatically.</Text> : null}
    </View>
  );

  return (
    <Screen
      footer={retryFooter}
      header={<PageHeader eyebrow="Synchronization" title="Pending sync" description="Work saved on this device that has not reached ehllo yet." />}>
      <Panel style={styles.summary}>
        <View style={styles.summaryIconWrap}>
          {showLottie ? (
            <LottieView
              source={loading
                ? require('@/assets/animations/processing.json')
                : status.total
                  ? require('@/assets/animations/pending.json')
                  : require('@/assets/animations/success.json')}
              autoPlay
              loop={loading || status.total > 0}
              style={styles.summaryLottie}
            />
          ) : null}
        </View>
        <Text style={styles.summaryTitle}>{loading ? 'Checking this device…' : status.total ? `${status.total} item${status.total === 1 ? '' : 's'} waiting` : 'Everything is synced'}</Text>
        <Text style={styles.summaryDetail}>{online ? 'Online · ehllo retries automatically' : 'Offline · your work remains safely on this device'}</Text>
        {otherDevicesPending > 0 ? (
          <Text style={styles.summaryDetail}>
            {otherDevicesPending} item{otherDevicesPending === 1 ? '' : 's'} also waiting on another device
          </Text>
        ) : null}
      </Panel>

      {loading ? (
        <PendingSyncSkeleton count={rows.length} />
      ) : (
        <View style={styles.list}>
          {rows.map(({ key, icon: Icon, label, count, detail }) => (
            <View key={key} style={styles.row}>
              <View style={styles.rowIcon}><Icon size={19} color={colors.ink} weight="bold" /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{label}</Text>
                <Text style={styles.rowDetail}>{detail}</Text>
              </View>
              <Text accessibilityLabel={`${count} pending`} style={[styles.count, count === 0 && styles.countZero]}>{count}</Text>
            </View>
          ))}
        </View>
      )}

      {status.items.length ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailHeading}>Waiting on this device</Text>
          {status.items.map((item) => (
            <View key={item.key} style={styles.itemCard}>
              <View style={styles.itemTopRow}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemTime}>{new Date(item.queuedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
              <Text style={styles.itemDetail}>{item.detail}</Text>
              {item.failure ? (
                <View style={styles.failureBox}>
                  <Text style={styles.failureTitle}>Retry failed · {item.failure.attempts} attempt{item.failure.attempts === 1 ? '' : 's'}</Text>
                  <Text style={styles.failureMessage}>{item.failure.message}</Text>
                </View>
              ) : (
                <Text style={styles.waitingText}>{online ? 'Waiting for the next sync pass' : 'Will retry when you’re online'}</Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { alignItems: 'center', gap: spacing.x1 },
  summaryIconWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.x1 },
  summaryLottie: { width: '100%', height: '100%' },
  summaryTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  summaryDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  list: { gap: spacing.x2 },
  row: { minHeight: 72, padding: spacing.x4, borderRadius: 16, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rowDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  count: { minWidth: 28, height: 28, borderRadius: 14, textAlign: 'center', lineHeight: 28, overflow: 'hidden', backgroundColor: colors.accent, color: colors.ink, fontWeight: '800' },
  countZero: { backgroundColor: colors.surfaceMuted, color: colors.muted },
  retryFooter: { gap: spacing.x2 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  detailSection: { gap: spacing.x2 },
  detailHeading: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: spacing.x1 },
  itemCard: { padding: spacing.x4, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 4 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x2 },
  itemTitle: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '800' },
  itemTime: { color: colors.muted, fontSize: 11 },
  itemDetail: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  waitingText: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: spacing.x1 },
  failureBox: { marginTop: spacing.x2, padding: spacing.x3, borderRadius: 12, backgroundColor: '#FFF1EE', gap: 3 },
  failureTitle: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  failureMessage: { color: colors.danger, fontSize: 11, lineHeight: 16 },
});

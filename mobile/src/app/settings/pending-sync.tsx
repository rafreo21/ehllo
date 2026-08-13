import { useFocusEffect } from 'expo-router';
import { ArrowsClockwise, CalendarCheck, CheckCircle, CloudArrowUp, ListChecks, Microphone, Scan } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, PageHeader, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { readPendingSyncStatus, type PendingSyncStatus } from '@/features/sync/pending-sync-status';
import { requestForegroundSync } from '@/lib/background-sync';
import { useIsOnline } from '@/lib/connectivity';
import { colors, spacing } from '@/theme/tokens';

const EMPTY_STATUS: PendingSyncStatus = {
  scans: [], quickFollowUps: [], followUpActions: [], transcriptions: [], eventActions: [], total: 0,
};

export default function PendingSyncScreen() {
  const { session } = useAuth();
  const online = useIsOnline();
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

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
    requestForegroundSync();
    setTimeout(() => {
      void refresh().finally(() => setRetrying(false));
    }, 1_500);
  }

  const rows = [
    { key: 'scans', icon: Scan, label: 'Connection scans', count: status.scans.length, detail: 'Cards waiting to be added to Connections' },
    { key: 'quick', icon: ListChecks, label: 'Quick follow-ups', count: status.quickFollowUps.length, detail: 'Follow-ups waiting to be created' },
    { key: 'actions', icon: CheckCircle, label: 'Follow-up changes', count: status.followUpActions.length, detail: 'Complete, reopen, snooze, or dismiss changes' },
    { key: 'transcriptions', icon: Microphone, label: 'Transcriptions', count: status.transcriptions.length, detail: 'Local recordings waiting for transcription' },
    { key: 'events', icon: CalendarCheck, label: 'Event attendance', count: status.eventActions.length, detail: 'Going, Not going, or I’ve left changes' },
  ];

  return (
    <Screen header={<PageHeader eyebrow="Synchronization" title="Pending sync" description="Work saved on this device that has not reached AfterMeet yet." />}>
      <Panel style={styles.summary}>
        <View style={styles.summaryIcon}>
          {loading ? <ActivityIndicator color={colors.ink} /> : <CloudArrowUp size={22} color={colors.ink} weight="bold" />}
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>{loading ? 'Checking this device…' : status.total ? `${status.total} item${status.total === 1 ? '' : 's'} waiting` : 'Everything is synced'}</Text>
          <Text style={styles.summaryDetail}>{online ? 'Online · AfterMeet retries automatically' : 'Offline · your work remains safely on this device'}</Text>
        </View>
      </Panel>

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

      <Button
        disabled={!online || !session?.access_token || status.total === 0}
        loading={retrying}
        onPress={() => void retryNow()}>
        <ArrowsClockwise size={18} color={colors.white} weight="bold" />
        Retry now
      </Button>
      {!session ? <Text style={styles.note}>Sign in before queued work can sync.</Text> : null}
      {!online ? <Text style={styles.note}>Reconnect to the internet, then AfterMeet will retry automatically.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  summaryIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  summaryDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  list: { gap: spacing.x2 },
  row: { minHeight: 72, padding: spacing.x4, borderRadius: 16, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rowDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  count: { minWidth: 28, height: 28, borderRadius: 14, textAlign: 'center', lineHeight: 28, overflow: 'hidden', backgroundColor: colors.accent, color: colors.ink, fontWeight: '800' },
  countZero: { backgroundColor: colors.surfaceMuted, color: colors.muted },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});

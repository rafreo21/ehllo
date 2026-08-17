import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRight, CheckCircle, Trash } from 'phosphor-react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { EmptyState } from '@/components/empty-state';
import { OfflineBanner } from '@/components/offline-banner';
import { Body, Button, PageHeader, Panel, Screen } from '@/components/ui';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { SettingsSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { fetchContacts } from '@/features/connections/connections-api';
import type { SavedDirectoryContact } from '@/features/connections/connection-directory';
import { saveConnectionToEhllo } from '@/features/connections/save-connection-contact';
import { fetchInboundExchanges, type InboundExchange } from '@/features/encounters/encounter-api';
import { normalizeEmailForMatching, normalizePhoneForMatching } from '@/lib/contact-identity';
import { describeError } from '@/lib/friendly-error';
import { mobileFetch } from '@/lib/mobile-api';
import { formatDateTime } from '@/lib/relative-time';
import { colors, spacing, fonts } from '@/theme/tokens';

async function dismissExchange(accessToken: string, id: string) {
  const response = await mobileFetch('/api/cards/exchanges', accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status: 'dismissed' }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not update this scan.');
}

function formatScanMeta(exchange: InboundExchange) {
  return [exchange.visitor_email, exchange.visitor_phone].filter(Boolean).join(' · ')
    || exchange.visitor_company
    || 'No contact details shared';
}

type ScanGroup = {
  key: string;
  latest: InboundExchange;
  scans: InboundExchange[];
};

function scanIdentityKey(exchange: InboundExchange) {
  const email = normalizeEmailForMatching(exchange.visitor_email);
  if (email) return `email:${email}`;
  const phone = normalizePhoneForMatching(exchange.visitor_phone);
  if (phone) return `phone:${phone}`;
  const name = exchange.visitor_name?.trim().toLowerCase();
  if (name) return `name:${name}`;
  return `id:${exchange.id}`;
}

function alreadyInDirectory(exchange: InboundExchange, contacts: SavedDirectoryContact[]) {
  const email = normalizeEmailForMatching(exchange.visitor_email);
  const phone = normalizePhoneForMatching(exchange.visitor_phone);
  return contacts.some((contact) => (
    (email && normalizeEmailForMatching(contact.email) === email)
    || (phone && normalizePhoneForMatching(contact.phone) === phone)
    || contact.exchangeId === exchange.id
  ));
}

function groupScans(exchanges: InboundExchange[]): ScanGroup[] {
  const groups = new Map<string, InboundExchange[]>();
  for (const exchange of exchanges) {
    const key = scanIdentityKey(exchange);
    const list = groups.get(key) ?? [];
    list.push(exchange);
    groups.set(key, list);
  }
  return Array.from(groups.values())
    .map((scans) => {
      const sorted = [...scans].sort((left, right) => (right.created_at || '').localeCompare(left.created_at || ''));
      return { key: sorted[0].id, latest: sorted[0], scans: sorted };
    })
    .sort((left, right) => (right.latest.created_at || '').localeCompare(left.latest.created_at || ''));
}

export default function RecentScansScreen() {
  const { session } = useAuth();
  const { card } = useCard();
  const accessToken = session?.access_token ?? null;
  const [exchanges, setExchanges] = useState<InboundExchange[]>([]);
  const [savedContacts, setSavedContacts] = useState<SavedDirectoryContact[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [historyGroup, setHistoryGroup] = useState<ScanGroup | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setInitialLoading(false);
      return;
    }
    try {
      const [items, contacts] = await Promise.all([
        fetchInboundExchanges(accessToken),
        fetchContacts(accessToken).catch(() => [] as SavedDirectoryContact[]),
      ]);
      setExchanges(items);
      setSavedContacts(contacts);
    } catch (caught) {
      setError(describeError(caught, 'Could not load your scans.'));
    } finally {
      setInitialLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  async function addGroupToDirectory(group: ScanGroup) {
    if (!accessToken) return;
    setBusyId(group.key);
    setError('');
    const exchange = group.latest;
    try {
      await saveConnectionToEhllo(accessToken, {
        id: `inbound-${exchange.id}`,
        sourceId: exchange.id,
        name: exchange.visitor_name || 'Unknown visitor',
        subtitle: '',
        email: exchange.visitor_email || undefined,
        phone: exchange.visitor_phone || undefined,
        company: exchange.visitor_company || undefined,
        role: exchange.visitor_role || undefined,
        source: 'inbound',
      }, card);
      const duplicates = group.scans.filter((item) => item.id !== exchange.id);
      await Promise.all(duplicates.map((item) => dismissExchange(accessToken, item.id).catch(() => {})));
      setHistoryGroup(null);
      await refresh();
    } catch (caught) {
      setError(describeError(caught, 'Could not save this person to your directory.'));
    } finally {
      setBusyId('');
    }
  }

  async function dismissGroup(group: ScanGroup) {
    if (!accessToken) return;
    setBusyId(group.key);
    setError('');
    try {
      await Promise.all(group.scans.map((item) => dismissExchange(accessToken, item.id)));
      const dismissedIds = new Set(group.scans.map((item) => item.id));
      setExchanges((current) => current.filter((item) => !dismissedIds.has(item.id)));
      setHistoryGroup(null);
    } catch (caught) {
      setError(describeError(caught, 'Could not update this scan.'));
    } finally {
      setBusyId('');
    }
  }

  const notImported = exchanges.filter((exchange) => exchange.status !== 'imported');
  const groups = useMemo(() => groupScans(notImported), [notImported]);

  const header = (
    <>
      <PageHeader eyebrow="Settings" title="Recent scans" />
      <Body>Everyone who scanned your card. Already-saved people are marked.</Body>
    </>
  );

  return (
    <Screen header={header}>
      <OfflineBanner message="Offline. Showing your saved scans. New scans will sync once you're back online." />
      {session && initialLoading ? <SettingsSkeleton /> : null}

      {!session ? (
        <EmptyState
          illustration={require('@/assets/animations/recent-scans.json')}
          title="Sign in to see recent scans"
          copy="People who scanned your card but aren't saved yet will show up here."
          primaryLabel="Sign in"
          onPrimary={() => router.push('/auth')}
        />
      ) : null}

      {session && !initialLoading && !groups.length ? (
        <Panel>
          <Text style={styles.panelTitle}>Nothing to add</Text>
          <Text style={styles.panelCopy}>Every scan has been saved, or you haven&apos;t had one yet.</Text>
        </Panel>
      ) : null}

      {groups.length ? (
        <View style={styles.list}>
          {groups.map((group) => {
            const repeated = group.scans.length > 1;
            const saved = alreadyInDirectory(group.latest, savedContacts);
            return (
              <Panel key={group.key} style={styles.card}>
                <Pressable
                  style={styles.cardCopy}
                  disabled={!repeated}
                  accessibilityRole={repeated ? 'button' : undefined}
                  onPress={repeated ? () => setHistoryGroup(group) : undefined}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{group.latest.visitor_name || 'Unknown visitor'}</Text>
                    {saved ? (
                      <View style={styles.savedTag}>
                        <CheckCircle size={11} color={colors.ink} weight="fill" />
                        <Text style={styles.savedTagText}>Saved</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardDescription} numberOfLines={1}>{formatScanMeta(group.latest)}</Text>
                  <Text style={styles.cardDate} numberOfLines={1}>
                    {repeated
                      ? `Scanned ${group.scans.length} times · Last ${formatDateTime(group.latest.created_at || '') || 'recently'}`
                      : formatDateTime(group.latest.created_at || '')}
                  </Text>
                </Pressable>
                {busyId === group.key ? (
                  <ActivityIndicator color={colors.ink} />
                ) : repeated ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View scan history"
                    onPress={() => setHistoryGroup(group)}
                    style={styles.historyChevron}>
                    <CaretRight size={18} color={colors.muted} weight="bold" />
                  </Pressable>
                ) : saved ? (
                  <Button variant="ghost" onPress={() => void dismissGroup(group)}>
                    <Trash size={16} color={colors.muted} />
                    Dismiss
                  </Button>
                ) : (
                  <View style={styles.cardActions}>
                    <Button onPress={() => void addGroupToDirectory(group)}>
                      <CheckCircle size={16} color={colors.white} weight="bold" />
                      Add
                    </Button>
                    <Button variant="ghost" onPress={() => void dismissGroup(group)}>
                      <Trash size={16} color={colors.muted} />
                      Dismiss
                    </Button>
                  </View>
                )}
              </Panel>
            );
          })}
        </View>
      ) : null}

      <BottomSheet
        visible={Boolean(historyGroup)}
        title={historyGroup?.latest.visitor_name || 'Scan history'}
        onClose={() => setHistoryGroup(null)}>
        {historyGroup ? (
          <View style={styles.historyContent}>
            <Text style={styles.cardDescription}>{formatScanMeta(historyGroup.latest)}</Text>
            {alreadyInDirectory(historyGroup.latest, savedContacts) ? (
              <View style={styles.savedTag}>
                <CheckCircle size={12} color={colors.ink} weight="fill" />
                <Text style={styles.savedTagText}>Saved to directory</Text>
              </View>
            ) : null}
            <View style={styles.historyList}>
              {historyGroup.scans.map((scan) => (
                <View key={scan.id} style={styles.historyRow}>
                  <Text style={styles.historyTimestamp}>
                    {formatDateTime(scan.created_at || '') || 'Unknown time'}
                  </Text>
                </View>
              ))}
            </View>
            {busyId === historyGroup.key ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <View style={styles.cardActions}>
                {alreadyInDirectory(historyGroup.latest, savedContacts) ? null : (
                  <Button onPress={() => void addGroupToDirectory(historyGroup)}>
                    <CheckCircle size={16} color={colors.white} weight="bold" />
                    Add
                  </Button>
                )}
                <Button variant="ghost" onPress={() => void dismissGroup(historyGroup)}>
                  <Trash size={16} color={colors.muted} />
                  Dismiss
                </Button>
              </View>
            )}
          </View>
        ) : null}
      </BottomSheet>

      <OutcomeErrorSheet
        visible={Boolean(error)}
        message={error}
        onClose={() => setError('')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panelTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.extrabold, fontWeight: '800' },
  panelCopy: { marginTop: 6, color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  list: { gap: spacing.x2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
  },
  cardCopy: { flex: 1, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  cardTitle: { flexShrink: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800' },
  cardDescription: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  cardDate: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
  cardActions: { gap: spacing.x2 },
  historyChevron: { padding: spacing.x2 },
  historyContent: { gap: spacing.x4 },
  historyList: { gap: spacing.x2 },
  historyRow: {
    paddingVertical: spacing.x2,
    paddingHorizontal: spacing.x3,
    borderRadius: 10,
    backgroundColor: colors.canvas,
  },
  historyTimestamp: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '700' },
  savedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: spacing.x2,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  savedTagText: { color: colors.ink, fontSize: 10, fontFamily: fonts.extrabold, fontWeight: '800' },
});

import { router, useFocusEffect } from 'expo-router';
import { ClockCounterClockwise, ListChecks, Plus, WifiSlash } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { FollowUpAudienceSheet } from '@/components/follow-up-audience-sheet';
import { FollowUpMissingSheet } from '@/components/follow-up-missing-sheet';
import { FollowUpSortSheet } from '@/components/follow-up-sheets';
import { GroupedFollowUpActions, GroupedFollowUpCell } from '@/components/grouped-follow-up-cell';
import { EmptyState } from '@/components/empty-state';
import { GreenHeroCard } from '@/components/green-hero-card';
import { HistoryToolbar } from '@/components/history-toolbar';
import { MiniPromptCard } from '@/components/mini-prompt-card';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { CaptureListSkeleton } from '@/components/skeleton';
import { Body, HeaderActionButton, PageHeader, PillButton } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { fetchFollowUps, type FollowUpItem } from '@/features/follow-ups/follow-up-api';
import {
  applyFollowUpQueueToItems,
  readCachedFollowUps,
  readFollowUpQueue,
  writeCachedFollowUps,
} from '@/features/follow-ups/follow-up-cache';
import {
  deviceNotificationsEnabled,
  syncFollowUpNotifications,
} from '@/features/notifications/notification-service';
import {
  buildFollowUpGroups,
  filterFollowUpGroups,
  sortFollowUpGroups,
  type FollowUpScope,
  type FollowUpSort,
} from '@/features/follow-ups/follow-up-list';
import type { FollowUpGroup } from '@/features/follow-ups/follow-up-groups';
import { useFollowUpActions } from '@/features/follow-ups/use-follow-up-actions';
import { describeError } from '@/lib/friendly-error';
import { isNetworkError } from '@/lib/mobile-api';
import { useAppInsets } from '@/lib/safe-area';
import { colors, spacing } from '@/theme/tokens';

export function FollowUpsScreen({ showBack = true, historyOnly = false }: { showBack?: boolean; historyOnly?: boolean }) {
  const { session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token;
  const insets = useAppInsets();
  const scope: FollowUpScope = historyOnly ? 'past' : 'current';
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FollowUpSort>(historyOnly ? 'recent' : 'urgency');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<FollowUpGroup | null>(null);
  const [completedMessage, setCompletedMessage] = useState('');

  const {
    runFollowUp,
    markComplete,
    markOpen,
    completingId,
    missingOpen,
    missingExecution,
    missingLoading,
    closeMissing,
    requestMissingField,
    draftRequestEmail,
    audienceOpen,
    audienceItem,
    audienceParticipants,
    confirmAudience,
    closeAudience,
  } = useFollowUpActions(accessToken, {
    allFollowUps: followUps,
  });

  const loadFollowUps = useCallback(async (background = false) => {
    // Same reasoning as Home: session can momentarily read null while it's
    // still resolving (e.g. right after a reload), not because the user
    // actually signed out — don't wipe a working list on that transient window.
    if (authLoading) return;

    if (!accessToken) {
      setFollowUps([]);
      setError('');
      setOffline(false);
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    setError('');
    try {
      const nextFollowUps = await fetchFollowUps(accessToken);
      const queue = await readFollowUpQueue();
      const overlaid = applyFollowUpQueueToItems(nextFollowUps, queue);
      setFollowUps(overlaid);
      setOffline(false);
      await writeCachedFollowUps(overlaid);
      if (await deviceNotificationsEnabled()) {
        await syncFollowUpNotifications(overlaid);
      }
    } catch (caught) {
      if (isNetworkError(caught)) {
        // Keep whatever's already on screen (cached copy) instead of wiping
        // it — a transient offline blip shouldn't blank out a working list.
        setOffline(true);
      } else {
        setFollowUps([]);
        setError(describeError(caught, 'Could not load follow-ups.'));
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, authLoading]);

  useFocusEffect(
    useCallback(() => {
      if (accessToken) {
        void (async () => {
          const [cached, queue] = await Promise.all([readCachedFollowUps(), readFollowUpQueue()]);
          if (cached.length) {
            setFollowUps(applyFollowUpQueueToItems(cached, queue));
            setLoading(false);
          }
        })();
      }
      void loadFollowUps();
      const interval = setInterval(() => void loadFollowUps(true), 30_000);
      return () => clearInterval(interval);
    }, [accessToken, loadFollowUps]),
  );

  const scopedGroups = useMemo(
    () => buildFollowUpGroups(followUps, scope),
    [followUps, scope],
  );

  const visibleGroups = useMemo(
    () => sortFollowUpGroups(filterFollowUpGroups(scopedGroups, query), sort),
    [query, scopedGroups, sort],
  );

  const hasFollowUps = scopedGroups.length > 0;

  function completeAndConfirm(item: FollowUpItem) {
    void markComplete(item, loadFollowUps).then(() => {
      setCompletedMessage(item.owner === 'guest'
        ? `Marked as done for ${item.personName.trim() || 'them'}.`
        : 'Nice, marked as done.');
    }).catch(() => {});
  }

  function reopenAndConfirm(item: FollowUpItem) {
    void markOpen(item, loadFollowUps).then(() => {
      setCompletedMessage('Moved back to Current follow-ups.');
    }).catch(() => {});
  }

  function runGroupFollowUp(group: FollowUpGroup) {
    if (group.items.length === 1) {
      runFollowUp(group.items[0]);
      return;
    }
    setActiveGroup(group);
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <PageHeader
            eyebrow={historyOnly ? 'History' : 'Follow-ups'}
            title={historyOnly ? 'Completed follow-ups' : 'Stay on top of next steps'}
            titleStyle={styles.title}
            onBack={() => router.back()}
            showBack={showBack}
            rightAction={!historyOnly ? (
              <HeaderActionButton accessibilityLabel="Open follow-up history" onPress={() => router.push('/settings/follow-ups-history')}>
                <ClockCounterClockwise size={21} color={colors.ink} weight="bold" />
              </HeaderActionButton>
            ) : undefined}
          />
          <View style={styles.headerCopy}>
            <Body>
              {historyOnly ? 'Everything you have checked off.' : 'Everything left to do, yours and theirs.'}
            </Body>
          </View>

          {offline && followUps.length ? (
            <View style={styles.offlineTag}>
              <WifiSlash size={14} color={colors.muted} weight="bold" />
              <Text style={styles.offlineTagText}>Offline. Showing your saved list</Text>
            </View>
          ) : null}

          {!historyOnly && session ? (
            <PillButton
              tone="solid"
              icon={<Plus size={18} color={colors.white} weight="bold" />}
              style={[styles.addButton, styles.addButtonPill]}
              textStyle={styles.addButtonPillText}
              onPress={() => router.push('/quick-follow-up')}>
              Add follow-up
            </PillButton>
          ) : null}

          {historyOnly && session && hasFollowUps ? (
            <HistoryToolbar
              query={query}
              placeholder="Search follow-ups"
              onChangeQuery={setQuery}
              onPressSort={() => setSortOpen(true)}
            />
          ) : null}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.x6 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {!session ? (
            <GreenHeroCard
              icon={<ListChecks size={28} color={colors.white} weight="bold" />}
              title="Sign in to see follow-ups"
              copy="Pick follow-up channels in capture and they will show up here."
              primaryLabel="Sign in"
              onPrimary={() => router.push('/auth')}
            />
          ) : loading && !followUps.length ? (
            <CaptureListSkeleton count={6} />
          ) : error ? (
            <MiniPromptCard
              icon={<ListChecks size={18} color={colors.ink} weight="bold" />}
              title="Could not load follow-ups"
              copy={error}
              onPress={() => void loadFollowUps()}
            />
          ) : hasFollowUps ? (
            <View style={styles.list}>
              {visibleGroups.map((group) => (
                <GroupedFollowUpCell
                  key={group.id}
                  group={group}
                  onPress={() => runGroupFollowUp(group)}
                  onComplete={() => {
                    const item = group.items[0];
                    if (item) completeAndConfirm(item);
                  }}
                  onReopen={() => {
                    const item = group.items[0];
                    if (item) reopenAndConfirm(item);
                  }}
                  completing={group.items.length === 1 && completingId === `${group.items[0]?.encounterId}-${group.items[0]?.actionId}`}
                />
              ))}
              {!visibleGroups.length ? (
                <Body style={styles.emptySearch}>No follow-ups match your search.</Body>
              ) : null}
            </View>
          ) : (
            <EmptyState
              illustration={require('@/assets/animations/follow-through.json')}
              title={historyOnly ? 'No completed follow-ups yet' : 'No current follow-ups'}
              copy={historyOnly
                ? 'Completed follow-ups will appear here after you check them off.'
                : 'Add a next step directly, or capture a conversation and create one from context.'}
              onPress={historyOnly ? undefined : () => router.push('/quick-follow-up')}
            />
          )}
        </ScrollView>
      </View>

      <FollowUpSortSheet
        visible={sortOpen}
        sort={sort}
        onClose={() => setSortOpen(false)}
        onSelect={setSort}
      />

      <BottomSheet
        visible={Boolean(activeGroup)}
        title={activeGroup?.personName.trim() || 'Follow-up actions'}
        onClose={() => setActiveGroup(null)}>
        {activeGroup ? (
          <GroupedFollowUpActions
            group={activeGroup}
            completingId={completingId}
            onPressItem={(actionId) => {
              const item = activeGroup.items.find((entry) => entry.actionId === actionId);
              // Close this sheet before running the action — it may open another
              // sheet (missing contact info, audience choice), and two RN
              // <Modal> instances visible at once hangs on iOS.
              setActiveGroup(null);
              if (item) runFollowUp(item);
            }}
            onCompleteItem={(actionId) => {
              const item = activeGroup.items.find((entry) => entry.actionId === actionId);
              // Close this sheet before opening the confirmation sheet — two
              // RN <Modal> instances visible at once hangs on iOS.
              setActiveGroup(null);
              if (item) completeAndConfirm(item);
            }}
            onReopenItem={(actionId) => {
              const item = activeGroup.items.find((entry) => entry.actionId === actionId);
              setActiveGroup(null);
              if (item) reopenAndConfirm(item);
            }}
          />
        ) : null}
      </BottomSheet>

      <OutcomeSuccessSheet
        visible={Boolean(completedMessage)}
        title={completedMessage.startsWith('Moved') ? 'Follow-up reopened' : 'Follow-up done'}
        message={completedMessage}
        lottieSource={completedMessage.startsWith('Moved') ? undefined : require('@/assets/animations/follow-up-completed.json')}
        onClose={() => setCompletedMessage('')}
      />

      <FollowUpMissingSheet
        visible={missingOpen}
        execution={missingExecution}
        loading={missingLoading}
        onClose={closeMissing}
        onRequest={() => void requestMissingField()}
        onDraftEmail={() => void draftRequestEmail()}
      />

      <FollowUpAudienceSheet
        visible={audienceOpen}
        item={audienceItem}
        participants={audienceParticipants}
        onClose={closeAudience}
        onConfirm={confirmAudience}
      />
    </View>
  );
}

export default FollowUpsScreen;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1 },
  header: { gap: spacing.x3, paddingHorizontal: spacing.x5 },
  headerCopy: { gap: spacing.x2, marginTop: -spacing.x1, marginBottom: spacing.x1 },
  addButton: { alignSelf: 'flex-start' },
  addButtonPill: { paddingHorizontal: spacing.x5, paddingVertical: spacing.x3 },
  addButtonPillText: { fontSize: 14 },
  title: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  scroll: { flex: 1, marginTop: spacing.x2 },
  scrollContent: { paddingHorizontal: spacing.x5, gap: spacing.x3, paddingTop: spacing.x2 },
  list: { gap: spacing.x2 },
  emptySearch: { textAlign: 'center', color: colors.muted },
  offlineTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.x1 },
  offlineTagText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
});

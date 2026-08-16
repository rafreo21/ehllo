import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import {
  Bell,
  CaretRight,
  Clock,
  HandWaving,
  IdentificationCard,
  ListChecks,
  Microphone,
  Notebook,
  UsersThree,
  X,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventCard } from '@/components/event-card';
import { MiniPromptCard } from '@/components/mini-prompt-card';
import { OfflineBanner } from '@/components/offline-banner';
import { PendingSyncBadge } from '@/components/pending-sync-badge';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { ProgressRing } from '@/components/progress-ring';
import { QuickActionsFab } from '@/components/quick-actions-fab';
import { Skeleton, SkeletonCircle, SkeletonLine } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { useCard } from '@/features/card/card-context';
import { usePendingSyncCount } from '@/features/sync/use-pending-sync-count';
import { useOtherDevicesPendingCount } from '@/features/sync/use-other-devices-pending';
import {
  getActiveCaptureController,
  subscribeToActiveCapture,
} from '@/features/encounters/active-capture-controller';
import { fetchEncounters, type EncounterSummary } from '@/features/encounters/encounter-api';
import { formatDuration } from '@/features/encounters/local-recordings';
import { listCaptureDrafts, type CaptureDraftSummary } from '@/features/encounters/capture-draft';
import {
  connectionAvatarUrl,
} from '@/features/connections/connection-public-card';
import {
  enrichConnectionPhotos,
  fetchAllConnectionsMerged,
  sortConnections,
  type ConnectionItem,
} from '@/features/connections/connections-api';
import { resolveHomeEventCardState, type HomeEventCardState } from '@/features/events/event-home-state';
import { fetchEventCandidates, fetchMyEvents, markEventLeft, setEventAttendance, type EventItem } from '@/features/events/events-api';
import { cacheEventAttendance, cacheEventLeftAt } from '@/features/events/event-cache';
import { fetchFollowUps, type FollowUpItem } from '@/features/follow-ups/follow-up-api';
import { summarizeFollowUpNudges } from '@/features/follow-ups/follow-up-nudges';
import { resolveFollowUpUserName } from '@/features/follow-ups/follow-up-participants';
import {
  fetchNotifications,
  markNotificationRead,
  notificationDeepLink,
  type NotificationRecord,
} from '@/features/notifications/notification-center-api';
import { formatRelativeTime } from '@/lib/relative-time';
import { useAppInsets, useTabBarHeight } from '@/lib/safe-area';
import { useDebouncedNavigate } from '@/lib/use-debounced-navigate';
import { colors, radius, spacing } from '@/theme/tokens';

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type ActiveWorkItem = {
  key: string;
  icon: typeof Microphone;
  label: string;
  onPress: () => void;
};

export default function HomeScreen() {
  const insets = useAppInsets();
  const tabBarHeight = useTabBarHeight();
  const navigate = useDebouncedNavigate();
  const { session, loading: authLoading } = useAuth();
  const pendingSync = usePendingSyncCount();
  const otherDevicesPending = useOtherDevicesPendingCount(pendingSync.total);
  const { card, cards, loading: cardLoading } = useCard();
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [nudges, setNudges] = useState<NotificationRecord[]>([]);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [drafts, setDrafts] = useState<CaptureDraftSummary[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [goingEvents, setGoingEvents] = useState<EventItem[]>([]);
  const [eventCandidates, setEventCandidates] = useState<EventItem[]>([]);
  const [eventCardBusy, setEventCardBusy] = useState(false);
  const [eventActionError, setEventActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState('');

  const activeCapture = useSyncExternalStore(
    subscribeToActiveCapture,
    getActiveCaptureController,
    getActiveCaptureController,
  );

  const greetingName = useMemo(() => {
    const name = resolveFollowUpUserName({
      activeCardName: card.name,
      cards,
      authName: String(session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || ''),
      authEmail: session?.user.email || '',
    });
    return name.split(' ')[0] || '';
  }, [card.name, cards, session?.user.email, session?.user.user_metadata]);

  const load = useCallback(async () => {
    setLoadError('');
    const draftList = await listCaptureDrafts();
    setDrafts(draftList);

    // authLoading means the session hasn't finished resolving yet (e.g. right
    // after a reload) — session momentarily reads null even though the user
    // is signed in. Only wipe the lists once we're sure they're actually
    // signed out, not mid-resolve, so a real reconnect doesn't flash "empty".
    if (authLoading) return;

    if (!session?.access_token) {
      setFollowUps([]);
      setUnreadNotifications(0);
      setNudges([]);
      setEncounters([]);
      setConnections([]);
      setGoingEvents([]);
      setEventCandidates([]);
      return;
    }

    const token = session.access_token;
    const [followUpsResult, notificationsResult, encountersResult, connectionsResult] = await Promise.allSettled([
      fetchFollowUps(token),
      fetchNotifications(token),
      fetchEncounters(token),
      fetchAllConnectionsMerged(token),
    ]);

    if (followUpsResult.status === 'fulfilled') setFollowUps(followUpsResult.value);
    if (notificationsResult.status === 'fulfilled') {
      setUnreadNotifications(notificationsResult.value.unreadCount);
      setNudges(notificationsResult.value.notifications.filter((item) => item.type === 'keep_in_touch' && !item.readAt));
    }
    if (encountersResult.status === 'fulfilled') setEncounters(encountersResult.value);
    if (connectionsResult.status === 'fulfilled') {
      setConnections(connectionsResult.value);
      // Real profile photos load in the background so the first paint isn't
      // blocked on a per-card fetch — same pattern as the connections list.
      void enrichConnectionPhotos(token, connectionsResult.value).then(setConnections);
    }

    if ([followUpsResult, notificationsResult, encountersResult, connectionsResult].every((result) => result.status === 'rejected')) {
      setLoadError('Could not load your Home data. Check your connection and try again.');
    }

    // Events are independent of the "did Home data load" error banner above
    // — a user with no calendar connected (the common case) has candidates
    // fail by design, and that must stay silent, not read as an outage.
    void fetchMyEvents(token).then(setGoingEvents).catch(() => undefined);
    void fetchEventCandidates(token).then((result) => setEventCandidates(result.candidates)).catch(() => setEventCandidates([]));
  }, [session, authLoading]);

  useFocusEffect(
    useCallback(() => {
      // Wait for the auth session to finish restoring from storage before the
      // first load — otherwise this can fire once with session still null,
      // render the signed-out/empty state, and latch hasLoadedOnce true
      // before the real session (and real data) ever arrives, permanently
      // skipping the skeleton on the load that actually matters.
      if (authLoading) return;
      void load().finally(() => {
        setLoading(false);
        setHasLoadedOnce(true);
      });
      const interval = setInterval(() => void load(), 30_000);
      return () => clearInterval(interval);
    }, [load, authLoading]),
  );

  const attention = useMemo(() => {
    const nudge = summarizeFollowUpNudges(followUps);
    const completed = followUps.filter((item) => item.status === 'completed').length;
    const total = followUps.length;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    if (nudge) {
      return { headline: nudge.headline, completed, total, rate, urgent: true, hasData: true };
    }
    if (total) {
      return { headline: 'You’re all caught up', completed, total, rate, urgent: false, hasData: true };
    }
    return { headline: 'No follow-ups yet', completed: 0, total: 0, rate: 0, urgent: false, hasData: false };
  }, [followUps]);

  const homeEventCard = useMemo(
    () => resolveHomeEventCardState(goingEvents, eventCandidates, new Date()),
    [goingEvents, eventCandidates],
  );

  async function dismissNudge(id: string) {
    setNudges((current) => current.filter((item) => item.id !== id));
    if (!session?.access_token) return;
    try {
      await markNotificationRead(session.access_token, id);
    } catch {
      // Best-effort — the card is already gone locally; it'll just come
      // back on next refresh if this failed, which is an acceptable retry.
    }
  }

  function openNudge(item: NotificationRecord) {
    void dismissNudge(item.id);
    const destination = notificationDeepLink(item);
    if (destination) navigate(destination as never);
  }

  async function decideEventCandidate(event: EventItem, status: 'going' | 'not_going') {
    if (!session?.access_token) return;
    setEventCardBusy(true);
    try {
      await setEventAttendance(session.access_token, event.id, status);
      await cacheEventAttendance(event, status);
      setEventCandidates((current) => current.filter((item) => item.id !== event.id));
      if (status === 'going') setGoingEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
      else setGoingEvents((current) => current.filter((item) => item.id !== event.id));
    } catch {
      // The event stays in the candidate list, but the user needs to know the
      // tap didn't actually do anything — this used to fail silently.
      setEventActionError('Could not update this event. Check your connection and try again.');
    } finally {
      setEventCardBusy(false);
    }
  }

  async function leaveEvent(event: EventItem) {
    if (!session?.access_token) return;
    setEventCardBusy(true);
    try {
      const leftAt = new Date().toISOString();
      await markEventLeft(session.access_token, event.id);
      await cacheEventLeftAt(event.id, leftAt);
      setGoingEvents((current) => current.map((item) => (item.id === event.id ? { ...item, leftAt } : item)));
    } catch {
      // The card stays showing "You're here", but the user needs to know the
      // tap didn't actually do anything — this used to fail silently.
      setEventActionError('Could not update this event. Check your connection and try again.');
    } finally {
      setEventCardBusy(false);
    }
  }

  const pendingReviewCount = useMemo(
    () => encounters.filter((item) => item.status === 'draft').length,
    [encounters],
  );

  const activeCaptureId = activeCapture?.snapshot.encounterId;

  const draftCount = useMemo(
    () => drafts.filter((item) => item.encounterId !== activeCaptureId).length,
    [drafts, activeCaptureId],
  );

  const activeWorkItems = useMemo<ActiveWorkItem[]>(() => {
    if (activeCapture) {
      const { status, seconds } = activeCapture.snapshot;
      const openCapture = () => navigate({
        pathname: '/capture/new',
        params: { draftId: activeCapture.snapshot.encounterId },
      });
      if (status === 'processing') {
        return [{ key: 'processing', icon: Clock, label: 'Preparing your transcript', onPress: openCapture }];
      }
      const label = status === 'paused'
        ? `Recording paused · ${formatDuration(seconds)}`
        : `Recording in progress · ${formatDuration(seconds)}`;
      return [{ key: 'recording', icon: Microphone, label, onPress: openCapture }];
    }

    const items: ActiveWorkItem[] = [];
    if (pendingReviewCount > 0 || draftCount > 0) {
      const parts: string[] = [];
      if (pendingReviewCount > 0) {
        parts.push(pendingReviewCount === 1 ? '1 ready to review' : `${pendingReviewCount} ready to review`);
      }
      if (draftCount > 0) {
        parts.push(draftCount === 1 ? '1 draft to finish' : `${draftCount} drafts to finish`);
      }
      items.push({
        key: 'capture',
        icon: Notebook,
        label: parts.join(' · '),
        onPress: () => navigate('/capture'),
      });
    }
    return items;
  }, [activeCapture, pendingReviewCount, draftCount, navigate]);

  const sortedConnections = useMemo(
    () => sortConnections(connections, 'date'),
    [connections],
  );
  const recentPeople = useMemo(() => sortedConnections.slice(0, 2), [sortedConnections]);

  const hasCard = cards.length > 0;
  // AppTabBar floats as an absolute overlay now, so this screen's root View
  // spans the full window height — the FAB must clear the pill itself.
  const fabBottomOffset = tabBarHeight + spacing.x3;
  const fabClearance = fabBottomOffset + 56 + spacing.x4;

  return (
    <View style={styles.safe}>
      <View style={[styles.fixedBar, { paddingTop: insets.top + spacing.x2 }]}>
        <View style={styles.fixedBarRow}>
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingTitle}>
              {greetingName ? `${timeGreeting()}, ${greetingName}` : timeGreeting()}
            </Text>
            <Text style={styles.greetingSubtitle} numberOfLines={1}>Here’s a quick look at what’s ahead.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unreadNotifications ? `${unreadNotifications} unread notifications` : 'Notifications'}
            hitSlop={4}
            onPress={() => navigate('/notifications')}
            style={({ pressed }) => [styles.bellButton, pressed && styles.bellButtonPressed]}>
            <Bell size={21} color={colors.ink} weight="bold" />
            {unreadNotifications ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{Math.min(unreadNotifications, 9)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: fabClearance }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <OfflineBanner
          message="Offline. Showing what's saved on this device. It'll sync when you're back online."
          style={styles.offlineBanner}
        />
        <PendingSyncBadge count={pendingSync.total} otherDevicesCount={otherDevicesPending} />
        {authLoading || (loading && !hasLoadedOnce) ? (
          <HomeSkeleton />
        ) : (
          <>
            {loadError ? (
              <MiniPromptCard
                icon={<ListChecks size={18} color={colors.ink} weight="bold" />}
                title="Could not load Home"
                copy={loadError}
                onPress={() => void load()}
              />
            ) : null}

            {session ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${attention.headline}. Open follow-ups`}
                onPress={() => navigate('/settings/follow-ups')}
                style={({ pressed }) => [styles.attentionCard, pressed && styles.attentionCardPressed]}>
                {attention.hasData ? (
                  <View style={styles.attentionRingWrap}>
                    <ProgressRing
                      size={54}
                      strokeWidth={4}
                      progress={attention.rate}
                      trackColor={colors.surfaceMuted}
                      progressColor={colors.accent}>
                      <ListChecks size={20} color={colors.ink} weight="bold" />
                    </ProgressRing>
                    {attention.urgent ? <View style={styles.attentionUrgentDot} /> : null}
                  </View>
                ) : (
                  <View style={[styles.attentionIcon]}>
                    <ListChecks size={20} color={colors.ink} weight="bold" />
                  </View>
                )}
                <View style={styles.attentionCopy}>
                  <Text style={styles.attentionHeadline}>{attention.headline}</Text>
                  {attention.hasData ? (
                    <Text style={styles.attentionSubline}>
                      <Text style={styles.attentionStat}>{attention.rate}%</Text> kept · {attention.completed} of {attention.total} completed
                    </Text>
                  ) : (
                    <Text style={styles.attentionSubline}>Your commitments will appear here.</Text>
                  )}
                </View>
                <CaretRight size={14} color={colors.muted} weight="bold" />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in to see your follow-ups. Open sign in"
                onPress={() => navigate('/auth')}
                style={({ pressed }) => [styles.attentionCard, pressed && styles.attentionCardPressed]}>
                <View style={styles.attentionIcon}>
                  <ListChecks size={20} color={colors.ink} weight="bold" />
                </View>
                <View style={styles.attentionCopy}>
                  <Text style={styles.attentionHeadline}>Follow-ups</Text>
                  <Text style={styles.attentionSubline}>Sign in to start tracking.</Text>
                </View>
                <CaretRight size={14} color={colors.muted} weight="bold" />
              </Pressable>
            )}

            {nudges.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => openNudge(item)}
                style={({ pressed }) => [styles.nudgeCard, pressed && styles.attentionCardPressed]}>
                <View style={styles.attentionIcon}>
                  <HandWaving size={20} color={colors.ink} weight="bold" />
                </View>
                <View style={styles.attentionCopy}>
                  <Text style={styles.attentionHeadline}>{item.title}</Text>
                  {item.body ? <Text style={styles.attentionSubline}>{item.body}</Text> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  hitSlop={8}
                  onPress={() => void dismissNudge(item.id)}
                  style={styles.nudgeDismiss}>
                  <X size={14} color={colors.muted} weight="bold" />
                </Pressable>
              </Pressable>
            ))}

            {session && homeEventCard.type !== 'none' ? (
              <HomeEventCard
                state={homeEventCard}
                busy={eventCardBusy}
                onGoing={(event) => void decideEventCandidate(event, 'going')}
                onNotGoing={(event) => void decideEventCandidate(event, 'not_going')}
                onLeave={(event) => void leaveEvent(event)}
              />
            ) : null}

            {activeWorkItems.length ? (
              <View style={styles.activeWork}>
                {activeWorkItems.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    onPress={item.onPress}
                    style={({ pressed }) => [styles.activeWorkRow, pressed && styles.activeWorkRowPressed]}>
                    <View style={styles.activeWorkIcon}>
                      <item.icon size={17} color={colors.ink} weight="bold" />
                    </View>
                    <Text style={styles.activeWorkLabel} numberOfLines={1}>{item.label}</Text>
                    <CaretRight size={14} color={colors.muted} weight="bold" />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Recent connections</Text>
                {session && sortedConnections.length > 2 ? (
                  <Pressable accessibilityRole="button" onPress={() => navigate('/connections')}>
                    <Text style={styles.viewAll}>View all</Text>
                  </Pressable>
                ) : null}
              </View>
              {session && recentPeople.length ? (
                <View style={styles.peopleList}>
                  {recentPeople.map((connection) => (
                    <RecentPersonRow key={connection.id} connection={connection} />
                  ))}
                </View>
              ) : session ? (
                <MiniPromptCard
                  icon={<UsersThree size={18} color={colors.ink} weight="fill" />}
                  title="No recent connections yet."
                  copy="Scan a card or add someone after your next conversation."
                  onPress={() => navigate('/scanner')}
                />
              ) : (
                <MiniPromptCard
                  icon={<UsersThree size={18} color={colors.ink} weight="fill" />}
                  title="Sign in to see connections"
                  copy="Scanned or added people show up here."
                  onPress={() => navigate('/auth')}
                />
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>My primary card</Text>
              {!cardLoading && hasCard ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigate(`/card/${card.id}`)}
                  style={({ pressed }) => [styles.myCardRow, pressed && styles.myCardRowPressed]}>
                  {card.photo ? (
                    <Image source={card.photo} style={styles.myCardAvatar} contentFit="cover" transition={200} alt="" />
                  ) : (
                    <View style={styles.myCardAvatarFallback}>
                      <IdentificationCard size={20} color={colors.ink} weight="bold" />
                    </View>
                  )}
                  <View style={styles.myCardCopy}>
                    <Text style={styles.myCardLabel} numberOfLines={1}>{card.label || 'My card'}</Text>
                    <Text style={styles.myCardMeta} numberOfLines={1}>
                      {[card.name, [card.role, card.company].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') || 'Add your details'}
                    </Text>
                  </View>
                  <Text style={styles.myCardAction}>Open card</Text>
                  <CaretRight size={14} color={colors.muted} weight="bold" />
                </Pressable>
              ) : !cardLoading ? (
                <MiniPromptCard
                  icon={<IdentificationCard size={18} color={colors.ink} weight="bold" />}
                  title="Create your first card"
                  copy="One tap, and anyone can save your details instantly."
                  onPress={() => navigate(`/edit-card?id=${card.id}`)}
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <QuickActionsFab />
      <OutcomeErrorSheet
        visible={Boolean(eventActionError)}
        message={eventActionError}
        onClose={() => setEventActionError('')}
      />
    </View>
  );
}

/**
 * The one Home event card, in the state resolveHomeEventCardState picked.
 * Deliberately renders at most one thing — no separate "Events" section —
 * so Home stays quiet except when something's actually relevant right now.
 */
function HomeEventCard({
  state,
  busy,
  onGoing,
  onNotGoing,
  onLeave,
}: {
  state: HomeEventCardState;
  busy: boolean;
  onGoing: (event: EventItem) => void;
  onNotGoing: (event: EventItem) => void;
  onLeave: (event: EventItem) => void;
}) {
  const navigate = useDebouncedNavigate();
  if (state.type === 'none') return null;
  const variant = state.type === 'upcoming' ? 'going' : state.type;

  return (
    <EventCard
      event={state.event}
      variant={variant}
      busy={busy}
      onPress={() => navigate('/events')}
      onGoing={onGoing}
      onNotGoing={onNotGoing}
      onLeave={onLeave}
    />
  );
}

function isRecentConnection(connectedAt?: string) {
  if (!connectedAt) return false;
  const connected = new Date(connectedAt).getTime();
  if (Number.isNaN(connected)) return false;
  return Date.now() - connected < 48 * 60 * 60 * 1000;
}

function RecentPersonRow({ connection }: { connection: ConnectionItem }) {
  const navigate = useDebouncedNavigate();
  const avatar = connection.photoUrl || connectionAvatarUrl(connection);
  const isNew = isRecentConnection(connection.connectedAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigate(`/connections/${encodeURIComponent(connection.id)}`)}
      style={({ pressed }) => [styles.personRow, pressed && styles.personRowPressed]}>
      <Image source={avatar} style={styles.personAvatar} contentFit="cover" transition={200} alt={`${connection.name} profile photo`} />
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>{connection.name}</Text>
        <Text style={styles.personSubtitle} numberOfLines={1}>
          {connection.subtitle}{connection.connectedAt ? ` · ${formatRelativeTime(connection.connectedAt)}` : ''}
        </Text>
      </View>
      {isNew ? (
        <View style={styles.personTag}>
          <Text style={styles.personTagText}>New</Text>
        </View>
      ) : null}
      <CaretRight size={14} color={colors.muted} weight="bold" />
    </Pressable>
  );
}

function HomeSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton style={styles.skeletonBanner} />
      <Skeleton style={styles.skeletonAttention} />
      <View style={styles.skeletonRow}>
        <Skeleton style={styles.skeletonButton} />
        <Skeleton style={styles.skeletonButton} />
      </View>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.skeletonPersonRow}>
          <SkeletonCircle size={40} />
          <View style={{ flex: 1, gap: spacing.x1 }}>
            <SkeletonLine width="60%" />
            <SkeletonLine width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  fixedBar: {
    paddingHorizontal: spacing.x5,
    paddingBottom: spacing.x3,
    backgroundColor: colors.canvas,
    zIndex: 2,
  },
  fixedBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.x3,
  },
  greetingBlock: { flex: 1, minWidth: 0, gap: 2 },
  offlineBanner: { marginTop: spacing.x2 },
  greetingTitle: { color: colors.ink, fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  greetingSubtitle: { color: colors.muted, fontSize: 13 },
  bellButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bellButtonPressed: { backgroundColor: colors.surfaceMuted },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.canvas,
  },
  bellBadgeText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x2,
    paddingBottom: spacing.x6,
    gap: spacing.x4,
  },
  attentionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x4,
    paddingVertical: spacing.x5,
    paddingLeft: spacing.x5,
    paddingRight: spacing.x3,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  attentionCardPressed: { opacity: 0.92 },
  nudgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x4,
    paddingVertical: spacing.x5,
    paddingLeft: spacing.x5,
    paddingRight: spacing.x8,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  nudgeDismiss: {
    position: 'absolute',
    top: spacing.x2,
    right: spacing.x2,
    width: 26,
    height: 26,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  attentionRingWrap: { width: 54, height: 54 },
  attentionUrgentDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: radius.round,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  attentionIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  attentionCopy: { flex: 1, gap: 4 },
  attentionHeadline: { color: colors.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  attentionSubline: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  attentionStat: { color: colors.ink, fontWeight: '800' },
  activeWork: { gap: spacing.x2 },
  activeWorkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  activeWorkRowPressed: { opacity: 0.9 },
  activeWorkIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  activeWorkLabel: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' },
  section: { gap: spacing.x3 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  viewAll: { color: colors.link, fontSize: 12, fontWeight: '800' },
  peopleList: { gap: spacing.x2 },
  personRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  personRowPressed: { opacity: 0.9 },
  personAvatar: { width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surfaceMuted },
  personCopy: { flex: 1, minWidth: 0, gap: 1 },
  personName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  personSubtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 15 },
  personTag: {
    paddingHorizontal: spacing.x2,
    paddingVertical: 3,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  personTagText: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  myCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  myCardRowPressed: { opacity: 0.9 },
  myCardAvatar: { width: 44, height: 44, borderRadius: radius.round, backgroundColor: colors.surfaceMuted },
  myCardAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  myCardCopy: { flex: 1, minWidth: 0, gap: 1 },
  myCardLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  myCardMeta: { color: colors.muted, fontSize: 12 },
  myCardAction: { color: colors.link, fontSize: 12, fontWeight: '800' },
  skeletonWrap: { gap: spacing.x4 },
  skeletonBanner: { height: 60, borderRadius: radius.medium },
  skeletonAttention: { height: 72, borderRadius: radius.medium },
  skeletonRow: { flexDirection: 'row', gap: spacing.x3 },
  skeletonButton: { flex: 1, height: 48, borderRadius: radius.small },
  skeletonPersonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
});

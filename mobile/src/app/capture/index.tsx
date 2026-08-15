import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowRight,
  ClockCounterClockwise,
  Microphone,
  Notebook,
  Pause,
  Play,
  Stop,
  Trash,
  UserCircle,
} from 'phosphor-react-native';
import LottieView from 'lottie-react-native';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button, HeaderActionButton, PageHeader, PillButton, ScreenFrame } from '@/components/ui';
import { HistoryToolbar } from '@/components/history-toolbar';
import { CaptureDeleteSheet } from '@/components/capture-delete-sheet';
import { EmptyState } from '@/components/empty-state';
import { OfflineBanner } from '@/components/offline-banner';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { CaptureListSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import {
  createFreshCaptureDraft,
  captureDraftFromRemote,
  deleteCaptureDraft,
  listCaptureDrafts,
  reconcileStaleLiveDraft,
  writeCaptureDraft,
  type CaptureDraftSummary,
} from '@/features/encounters/capture-draft';
import { deleteEncounter, fetchCaptureSessions, fetchEncounters, type EncounterSummary } from '@/features/encounters/encounter-api';
import { deleteLocalRecording, formatDuration } from '@/features/encounters/local-recordings';
import { isLiveRecordingSession } from '@/features/encounters/capture-session-state';
import {
  getActiveCaptureController,
  subscribeToActiveCapture,
} from '@/features/encounters/active-capture-controller';
import { describeError } from '@/lib/friendly-error';
import { isNetworkError } from '@/lib/mobile-api';
import { formatAbsoluteTime, formatRelativeTime } from '@/lib/relative-time';
import { colors, radius, spacing } from '@/theme/tokens';

type CaptureSort = 'recent' | 'oldest' | 'az';

function snippet(text: string, max = 140) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function stepLabel(step: number) {
  switch (step) {
    case 0: return 'Recording';
    case 1: return 'Gathering';
    case 2: return 'Context';
    case 3: return 'Follow-up';
    default: return 'In progress';
  }
}

function draftTitle(draft: CaptureDraftSummary) {
  if (draft.personName.trim()) return draft.personName.trim();
  if (draft.title.trim()) return draft.title.trim();
  if (draft.transcriptPreview.trim()) return snippet(draft.transcriptPreview, 48);
  return 'Untitled capture';
}

function draftStateLabel(draft: CaptureDraftSummary) {
  if (draft.sessionStatus === 'failed') return 'Recording interrupted';
  // A persisted snapshot is always a draft here. Only the in-memory active
  // capture controller can prove that a microphone session is currently live.
  if (draft.sessionStatus === 'paused') return 'Paused draft';
  if (draft.sessionStatus === 'recording') return 'Unfinished draft';
  if (draft.sessionStatus === 'processing') return 'Preparing review';
  if (draft.sessionStatus === 'review_ready') {
    return draft.transcriptPending ? 'Needs transcript. Tap to retry' : 'Ready to review';
  }
  return stepLabel(draft.step);
}

export function CaptureHomeScreen({ historyOnly = false }: { historyOnly?: boolean }) {
  const params = useLocalSearchParams<{ exchange?: string; slug?: string }>();
  const { session } = useAuth();
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [drafts, setDrafts] = useState<CaptureDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EncounterSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccessOpen, setDeleteSuccessOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CaptureSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [captureBlockedOpen, setCaptureBlockedOpen] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');
  const activeCapture = useSyncExternalStore(
    subscribeToActiveCapture,
    getActiveCaptureController,
    getActiveCaptureController,
  );
  const activeCaptureId = activeCapture?.snapshot.encounterId;

  const visibleDrafts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const nonActiveDrafts = drafts.filter((draft) => draft.encounterId !== activeCaptureId);
    if (!needle) return nonActiveDrafts;
    return nonActiveDrafts.filter((draft) => [draftTitle(draft), draftStateLabel(draft), draft.transcriptPreview]
      .some((value) => value.toLowerCase().includes(needle)));
  }, [activeCaptureId, drafts, query]);

  const pendingReviewEncounters = useMemo(
    () => encounters.filter((encounter) => encounter.status === 'draft'),
    [encounters],
  );

  const visibleEncounters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Unreviewed encounters live in the "Needs review" section on the
    // landing screen, not History — History is for completed, reviewed work.
    const reviewable = encounters.filter((encounter) => encounter.status !== 'draft');
    const filtered = needle
      ? reviewable.filter((encounter) => [encounter.personName, encounter.title, encounter.status]
        .some((value) => value?.toLowerCase().includes(needle)))
      : [...reviewable];
    filtered.sort((left, right) => {
      if (sort === 'az') return (left.personName || left.title).localeCompare(right.personName || right.title);
      const leftTime = new Date(left.startedAt || left.endedAt || 0).getTime();
      const rightTime = new Date(right.startedAt || right.endedAt || 0).getTime();
      return sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
    });
    return filtered;
  }, [encounters, query, sort]);

  useEffect(() => {
    if (params.exchange || params.slug) {
      router.replace({
        pathname: '/capture/new',
        params: {
          ...(params.exchange ? { exchange: String(params.exchange) } : {}),
          ...(params.slug ? { slug: String(params.slug) } : {}),
        },
      });
    }
  }, [params.exchange, params.slug]);

  const loadHome = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorSheetOpen(false);
    setErrorMessage('');
    setSyncNotice('');

    try {
      const draftList = await listCaptureDrafts();
      setDrafts(draftList);

      if (session?.access_token) {
        const [encounterResult, sessionResult] = await Promise.allSettled([
          fetchEncounters(session.access_token),
          fetchCaptureSessions(session.access_token),
        ]);

        if (encounterResult.status === 'fulfilled') {
          setEncounters(encounterResult.value);
        } else {
          setEncounters([]);
        }

        if (sessionResult.status === 'fulfilled') {
          const localById = new Map(draftList.map((item) => [item.encounterId, item]));
          for (const remoteSession of sessionResult.value) {
            const local = localById.get(remoteSession.encounterId);
            if (local && new Date(local.updatedAt).getTime() >= new Date(remoteSession.updatedAt).getTime()) continue;
            await writeCaptureDraft(captureDraftFromRemote(remoteSession));
          }
          setDrafts(await listCaptureDrafts());
        }

        if (encounterResult.status === 'rejected' || sessionResult.status === 'rejected') {
          const rejection = encounterResult.status === 'rejected'
            ? encounterResult.reason
            : sessionResult.status === 'rejected' ? sessionResult.reason : null;
          // A plain offline blip is already covered by the OfflineBanner up
          // top — this longer notice is reserved for a real server-side
          // sync failure while actually connected.
          if (!isNetworkError(rejection)) {
            setSyncNotice('Cloud sync is temporarily unavailable. You can still capture and save a draft on this device.');
          }
        }
      } else {
        setEncounters([]);
      }
    } catch (caught) {
      setErrorMessage(describeError(caught, 'Could not load captures.'));
      setErrorSheetOpen(true);
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      if (params.exchange || params.slug) return;
      void loadHome();
    }, [loadHome, params.exchange, params.slug]),
  );

  async function beginFreshCapture(captureMode: 'recording' | 'quick_context' = 'recording') {
    if (activeCapture && isLiveRecordingSession(activeCapture.snapshot.status)) {
      setCaptureBlockedOpen(true);
      return;
    }
    // Any other draft still showing recording/paused has no live session
    // behind it (that would have tripped the guard above) — it's stale from
    // an app kill or an interruption the watchdog never got to record.
    // Reconcile those before starting fresh so they don't linger looking
    // like phantom live recordings; this never blocks the new recording.
    const staleLiveDrafts = drafts.filter((item) => (
      (item.sessionStatus === 'recording' || item.sessionStatus === 'paused')
      && item.encounterId !== activeCaptureId
    ));
    if (staleLiveDrafts.length) {
      await Promise.all(staleLiveDrafts.map((item) => reconcileStaleLiveDraft(item.encounterId)));
      setDrafts(await listCaptureDrafts());
    }
    const draft = {
      ...createFreshCaptureDraft(),
      captureMode,
    };
    await writeCaptureDraft(draft);
    router.navigate({
      pathname: '/capture/new',
      params: {
        draftId: draft.encounterId,
        openConsent: captureMode === 'recording' ? '1' : undefined,
      },
    });
  }

  function continueCapture(encounterId: string) {
    router.navigate({
      pathname: '/capture/new',
      params: { draftId: encounterId },
    });
  }

  async function discardDraft(encounterId: string) {
    await deleteCaptureDraft(encounterId);
    setDrafts((current) => current.filter((item) => item.encounterId !== encounterId));
  }

  async function confirmDeleteEncounter() {
    if (!deleteTarget || !session?.access_token) return;
    setDeleting(true);
    setErrorSheetOpen(false);
    setErrorMessage('');
    try {
      await deleteEncounter(session.access_token, deleteTarget.id);
      await deleteLocalRecording(deleteTarget.id);
      setEncounters((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteSuccessOpen(true);
    } catch (caught) {
      setErrorMessage(describeError(caught, 'Could not delete this capture.'));
      setErrorSheetOpen(true);
    } finally {
      setDeleting(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  return (
    <ScreenFrame paddingHorizontal={0}>
      <View style={styles.page}>
        <View style={styles.header}>
          <PageHeader
            eyebrow={historyOnly ? 'History' : 'Capture'}
            title={historyOnly ? 'Previous captures' : 'Recordings & context'}
            titleStyle={styles.title}
            onBack={goBack}
            rightAction={!historyOnly ? (
              <HeaderActionButton accessibilityLabel="Open capture history" onPress={() => router.push('/capture/history')}>
                <ClockCounterClockwise size={21} color={colors.ink} weight="bold" />
              </HeaderActionButton>
            ) : undefined}
          />
          {!historyOnly ? <View style={styles.startActions}>
            <PillButton
              tone="solid"
              style={styles.startActionPill}
              textStyle={styles.startActionPillText}
              icon={<Microphone size={18} color={colors.white} weight="fill" />}
              onPress={() => void beginFreshCapture('recording')}>
              Start recording
            </PillButton>
            <PillButton
              tone="outline"
              style={styles.startActionPill}
              textStyle={styles.startActionPillText}
              icon={<Notebook size={18} color={colors.muted} weight="bold" />}
              onPress={() => void beginFreshCapture('quick_context')}>
              Add notes
            </PillButton>
          </View> : null}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={historyOnly ? [0] : undefined}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void loadHome(true)} tintColor={colors.ink} />
          }>
          {historyOnly ? <View style={styles.historyTools}>
            <HistoryToolbar
              query={query}
              placeholder="Search recordings and notes"
              onChangeQuery={setQuery}
              onPressSort={() => setSortOpen(true)}
            />
          </View> : null}

          <OfflineBanner
            message="Offline. You can still record or add notes. It'll sync once you're back online."
            style={styles.offlineBanner}
          />

          <View style={styles.listBlock}>
          {loading && !hasLoadedOnce ? <CaptureListSkeleton count={4} /> : (
          <>
          {!historyOnly ? (
            <>
              {activeCapture ? (
                <View style={styles.activeCard}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => continueCapture(activeCapture.snapshot.encounterId)}
                    style={styles.activeSummary}>
                    <View style={styles.activeIcon}>
                      <Microphone size={20} color={colors.white} weight="fill" />
                    </View>
                    <View style={styles.activeCopy}>
                      <Text style={styles.activeTitle}>
                        {activeCapture.snapshot.status === 'paused' ? 'Recording paused' : 'Recording now'}
                      </Text>
                      <Text style={styles.activeDuration}>{formatDuration(activeCapture.snapshot.seconds)}</Text>
                    </View>
                  </Pressable>
                  {activeCapture.snapshot.status !== 'processing' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={activeCapture.snapshot.status === 'paused' ? 'Resume recording' : 'Pause recording'}
                      onPress={() => void activeCapture.pauseOrResume()}
                      style={styles.activeControl}>
                      {activeCapture.snapshot.status === 'paused'
                        ? <Play size={19} color={colors.ink} weight="fill" />
                        : <Pause size={19} color={colors.ink} weight="fill" />}
                    </Pressable>
                  ) : null}
                  {activeCapture.snapshot.status !== 'processing' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Finish recording"
                      onPress={() => void activeCapture.finish()}
                      style={styles.activeFinish}>
                      <Stop size={16} color={colors.white} weight="fill" />
                      <Text style={styles.activeFinishText}>End</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {visibleDrafts.length ? <Text style={styles.sectionLabel}>In progress</Text> : null}
              {visibleDrafts.map((draft) => (
                <Pressable
                  key={draft.encounterId}
                  accessibilityRole="button"
                  onPress={() => continueCapture(draft.encounterId)}
                  style={({ pressed }) => [styles.draftCard, pressed && styles.captureCardPressed]}>
                  <View style={styles.captureTop}>
                    <View style={styles.personRow}>
                      <ClockCounterClockwise size={18} color={colors.ink} weight="bold" />
                      <Text style={styles.personName}>{draftTitle(draft)}</Text>
                    </View>
                    <Text style={styles.when}>{formatRelativeTime(draft.updatedAt)}</Text>
                  </View>
                  <Text style={[
                    styles.draftMeta,
                    (draft.sessionStatus === 'failed' || draft.transcriptPending) && styles.draftMetaInterrupted,
                  ]}>
                    {draftStateLabel(draft)}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={[styles.statusChip, draft.sessionStatus === 'failed' && styles.statusChipInterrupted]}>
                      {draft.sessionStatus === 'failed' ? 'Safe draft' : 'Draft'}
                    </Text>
                    <View style={styles.draftActions}>
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          void discardDraft(draft.encounterId);
                        }}
                        style={styles.discardButton}>
                        <Trash size={14} color={colors.danger} weight="bold" />
                        <Text style={styles.discardText}>Discard</Text>
                      </Pressable>
                      <View style={styles.openRow}>
                        <Text style={styles.openText}>Continue</Text>
                        <ArrowRight size={14} color={colors.ink} weight="bold" />
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}

              {pendingReviewEncounters.length ? <Text style={styles.sectionLabel}>Needs review</Text> : null}
              {pendingReviewEncounters.map((encounter) => (
                <Pressable
                  key={encounter.id}
                  accessibilityRole="button"
                  onPress={() => router.navigate(`/capture/${encounter.id}`)}
                  style={({ pressed }) => [styles.captureCard, pressed && styles.captureCardPressed]}>
                  <View style={styles.captureTop}>
                    <View style={styles.personRow}>
                      <UserCircle size={18} color={colors.ink} weight="fill" />
                      <Text style={styles.personName}>{encounter.personName || 'Someone new'}</Text>
                    </View>
                    <Text style={styles.when}>{formatRelativeTime(encounter.endedAt || encounter.startedAt)}</Text>
                  </View>
                  <Text style={styles.captureTitle}>{encounter.title || `Meeting with ${encounter.personName || 'someone'}`}</Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.statusChip}>Ready to review</Text>
                    <View style={styles.draftActions}>
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(encounter);
                        }}
                        style={styles.discardButton}>
                        <Trash size={14} color={colors.danger} weight="bold" />
                        <Text style={styles.discardText}>Delete</Text>
                      </Pressable>
                      <View style={styles.openRow}>
                        <Text style={styles.openText}>Review</Text>
                        <ArrowRight size={14} color={colors.ink} weight="bold" />
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}

              {!loading && visibleDrafts.length === 0 && pendingReviewEncounters.length === 0 && !activeCapture ? (
                <EmptyState
                  illustration={require('@/assets/animations/capture.json')}
                  title="Nothing in progress"
                  copy="Start a recording or add notes after a conversation."
                />
              ) : null}
            </>
          ) : (
            <>
              {!loading && encounters.length === 0 ? (
                <EmptyState
                  illustration={require('@/assets/animations/capture.json')}
                  title="No captures yet"
                  copy="Your saved meeting contexts and follow-ups will appear here after you complete a capture."
                />
              ) : null}

              {encounters.length ? <Text style={styles.sectionLabel}>Completed captures</Text> : null}

              {visibleEncounters.map((encounter) => (
                <Pressable
                  key={encounter.id}
                  accessibilityRole="button"
                  onPress={() => router.navigate(`/capture/${encounter.id}`)}
                  style={({ pressed }) => [styles.captureCard, pressed && styles.captureCardPressed]}>
                  <View style={styles.captureTop}>
                    <View style={styles.personRow}>
                      <UserCircle size={18} color={colors.ink} weight="fill" />
                      <Text style={styles.personName}>{encounter.personName || 'Someone new'}</Text>
                    </View>
                    <Text style={styles.when}>{formatAbsoluteTime(encounter.startedAt || encounter.endedAt)}</Text>
                  </View>

                  <Text style={styles.captureTitle}>{encounter.title || `Meeting with ${encounter.personName || 'someone'}`}</Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.statusChip}>{encounter.status}</Text>
                    <View style={styles.draftActions}>
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(encounter);
                        }}
                        style={styles.discardButton}>
                        <Trash size={14} color={colors.danger} weight="bold" />
                        <Text style={styles.discardText}>Delete</Text>
                      </Pressable>
                      <View style={styles.openRow}>
                        <Text style={styles.openText}>Open</Text>
                        <ArrowRight size={14} color={colors.ink} weight="bold" />
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
              {!loading && encounters.length > 0 && visibleEncounters.length === 0 ? (
                <Body style={styles.emptySearch}>No captures match your search.</Body>
              ) : null}
            </>
          )}
          </>
          )}
          </View>
        </ScrollView>
        {!historyOnly && (syncNotice || (!session && drafts.length > 0)) ? (
          <View style={styles.syncFooter}>
            <Text style={styles.syncFooterText}>
              {syncNotice || 'Saved on this device · Sign in to sync across devices'}
            </Text>
          </View>
        ) : null}
      </View>

      <CaptureDeleteSheet
        visible={Boolean(deleteTarget)}
        title={deleteTarget?.title || deleteTarget?.personName || 'this capture'}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteEncounter()}
      />

      <OutcomeSuccessSheet
        visible={deleteSuccessOpen}
        title="Deleted"
        message="This capture has been deleted."
        onClose={() => setDeleteSuccessOpen(false)}
      />

      <OutcomeErrorSheet
        visible={errorSheetOpen}
        message={errorMessage}
        onClose={() => {
          setErrorSheetOpen(false);
          setErrorMessage('');
        }}
      />

      <BottomSheet visible={sortOpen} title="Sort history" onClose={() => setSortOpen(false)}>
        <View style={styles.sortOptions}>
          <Button variant={sort === 'recent' ? 'primary' : 'secondary'} onPress={() => { setSort('recent'); setSortOpen(false); }}>Most recent</Button>
          <Button variant={sort === 'oldest' ? 'primary' : 'secondary'} onPress={() => { setSort('oldest'); setSortOpen(false); }}>Oldest first</Button>
          <Button variant={sort === 'az' ? 'primary' : 'secondary'} onPress={() => { setSort('az'); setSortOpen(false); }}>Person A–Z</Button>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={captureBlockedOpen}
        title="A recording is already live"
        onClose={() => {
          setCaptureBlockedOpen(false);
        }}>
        <View style={styles.blockedSheet}>
          <View style={styles.blockedIconWrap}>
            <LottieView
              source={require('@/assets/animations/warning.json')}
              autoPlay
              loop={false}
              style={styles.blockedLottie}
            />
          </View>
          <Body>
            ehllo keeps one live recording at a time so its audio, people, and transcript never get mixed together.
          </Body>
          <Button onPress={() => {
            setCaptureBlockedOpen(false);
            const encounterId = activeCapture?.snapshot.encounterId;
            if (encounterId) continueCapture(encounterId);
          }}>
            Return to live recording
          </Button>
        </View>
      </BottomSheet>
    </ScreenFrame>
  );
}

export default function CaptureEntryScreen() {
  return <CaptureHomeScreen />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: spacing.x5, paddingBottom: spacing.x3 },
  title: { fontSize: 30, lineHeight: 32 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: spacing.x6,
  },
  startActions: {
    paddingTop: spacing.x2,
    flexDirection: 'row',
    gap: spacing.x2,
  },
  startActionPill: { paddingHorizontal: spacing.x5, paddingVertical: spacing.x3 },
  startActionPillText: { fontSize: 14 },
  offlineBanner: { marginTop: spacing.x2 },
  activeCard: {
    minHeight: 72,
    padding: spacing.x2,
    borderRadius: radius.large,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
  },
  activeSummary: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingHorizontal: spacing.x1,
  },
  activeIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.medium,
    backgroundColor: '#2D6518',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCopy: { minWidth: 0, flex: 1 },
  activeTitle: { color: colors.white, fontSize: 15, fontWeight: '900' },
  activeDuration: { color: '#CFE1C8', fontSize: 13, fontWeight: '800', marginTop: 2 },
  activeControl: {
    width: 46,
    height: 46,
    borderRadius: radius.medium,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFinish: {
    height: 46,
    paddingHorizontal: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: '#28120E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
  },
  activeFinishText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  heroBlock: {
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x2,
    gap: spacing.x3,
  },
  quickContextAction: {
    minHeight: 72,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x3,
    borderRadius: radius.large,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
  },
  quickContextActionPressed: { opacity: 0.78 },
  quickContextIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  quickContextCopy: { flex: 1, gap: 2 },
  quickContextTitle: { color: colors.ink, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  quickContextHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  listBlock: {
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x3,
    gap: spacing.x3,
  },
  sectionLabel: {
    marginTop: spacing.x2,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  historyGroup: { gap: spacing.x3 },
  syncFooter: {
    minHeight: 38,
    paddingHorizontal: spacing.x5,
    paddingVertical: spacing.x2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  syncFooterText: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
  historyTools: {
    zIndex: 2,
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x2,
    paddingBottom: spacing.x3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sortOptions: { gap: spacing.x2 },
  blockedSheet: { gap: spacing.x3 },
  blockedIconWrap: { alignSelf: 'center', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  blockedLottie: { width: '100%', height: '100%' },
  emptySearch: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.x4 },
  draftCard: {
    gap: spacing.x2,
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  captureCard: {
    gap: spacing.x2,
    padding: spacing.x4,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
  },
  captureCardPressed: { opacity: 0.94 },
  captureTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2, flex: 1 },
  personName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  when: { color: colors.muted, fontSize: 12 },
  draftMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  draftMetaInterrupted: { color: colors.warning },
  captureTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  summaryBlock: {
    gap: 4,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  notesBlock: {
    gap: 4,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  blockLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  blockCopy: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  blockCopyMuted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  followUpRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  followUpText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.x1,
  },
  statusChip: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusChipInterrupted: { color: colors.warning },
  draftActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.x4 },
  discardButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  discardText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
});

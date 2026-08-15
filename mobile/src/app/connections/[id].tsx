import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CaretRight, CheckCircle, IdentificationCard, Microphone, Plus, Trash } from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConnectionCardSheet } from '@/components/connection-card-sheet';
import { BottomSheet } from '@/components/bottom-sheet';
import { ConnectionDeleteSheet } from '@/components/connection-delete-sheet';
import { FollowUpCell } from '@/components/follow-up-cell';
import { FollowUpMissingSheet } from '@/components/follow-up-missing-sheet';
import { FollowUpAudienceSheet } from '@/components/follow-up-audience-sheet';
import { FollowUpsSheet } from '@/components/follow-ups-sheet';
import { MeetingDetailSheet } from '@/components/meeting-detail-sheet';
import { MiniPromptCard } from '@/components/mini-prompt-card';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { ConnectionDetailSkeleton } from '@/components/skeleton';
import { BackButton, Body, Eyebrow, PillButton, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { loadConnectionLiveCard } from '@/features/connections/connection-card-loader';
import {
  findSavedDirectoryContact,
  resolveDirectorySaveState,
  directoryUpdateSummary,
  type SavedDirectoryContact,
} from '@/features/connections/connection-directory';
import {
  fetchContacts,
  connectionSourceLabel,
  deleteConnection,
  fetchAllConnectionsMerged,
  type ConnectionItem,
} from '@/features/connections/connections-api';
import { isConversationEncounter } from '@/features/connections/connection-history-state';
import {
  saveConnectionToEhllo,
  saveConnectionToDeviceContacts,
  updateConnectionDirectory,
} from '@/features/connections/save-connection-contact';
import type { MobileCard } from '@/features/card/types';
import type { EncounterPayload } from '@/features/encounters/encounter-api';
import { resolveEncounterRecordingUri } from '@/features/encounters/local-recordings';
import { fetchMyEvents, type EventItem } from '@/features/events/events-api';
import {
  fetchEncountersForConnection,
  fetchFollowUps,
  type FollowUpItem,
} from '@/features/follow-ups/follow-up-api';
import { isOpenFollowUp } from '@/features/follow-ups/follow-up-list';
import { useFollowUpActions } from '@/features/follow-ups/use-follow-up-actions';
import { formatMeetingDate } from '@/lib/due-date';
import { describeError } from '@/lib/friendly-error';
import { useAppInsets } from '@/lib/safe-area';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ConnectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const insets = useAppInsets();
  const [connection, setConnection] = useState<ConnectionItem | null>(null);
  const [card, setCard] = useState<MobileCard | null>(null);
  const [meetings, setMeetings] = useState<EncounterPayload[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [allFollowUps, setAllFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardLoading, setCardLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cardSlug, setCardSlug] = useState<string | null>(null);
  const [savedContact, setSavedContact] = useState<SavedDirectoryContact | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successSheetOpen, setSuccessSheetOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [cardSheetOpen, setCardSheetOpen] = useState(false);
  const [meetingsSheetOpen, setMeetingsSheetOpen] = useState(false);
  const [followUpsSheetOpen, setFollowUpsSheetOpen] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<EncounterPayload | null>(null);
  const [meetingRecordingUri, setMeetingRecordingUri] = useState<string | null>(null);
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
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
    allFollowUps,
  });

  // For the "Where we met" line in the meeting detail sheet — event is an
  // activator: with no linked event this stays empty and the sheet is
  // unchanged.
  useEffect(() => {
    if (!accessToken) return;
    void fetchMyEvents(accessToken).then(setMyEvents).catch(() => undefined);
  }, [accessToken]);

  const activeMeetingEventTitle = activeMeeting?.eventId
    ? myEvents.find((event) => event.id === activeMeeting.eventId)?.title
    : undefined;
  const activeMeetingEventLocation = activeMeeting?.eventId
    ? myEvents.find((event) => event.id === activeMeeting.eventId)?.location
    : undefined;

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setErrorSheetOpen(true);
  }, []);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setSuccessSheetOpen(true);
  }, []);

  const loadConnection = useCallback(async () => {
    if (!accessToken || !id) {
      setConnection(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const connections = await fetchAllConnectionsMerged(accessToken);
      const match = connections.find((item) => item.id === decodeURIComponent(id));
      setConnection(match || null);
      if (!match) showError('This connection could not be found.');
    } catch (caught) {
      showError(describeError(caught, 'Could not load this connection.'));
      setConnection(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, id, showError]);

  const loadMeetingsAndFollowUps = useCallback(async (current: ConnectionItem) => {
    if (!accessToken) return;
    try {
      const [nextMeetings, allFollowUps] = await Promise.all([
        fetchEncountersForConnection(accessToken, {
          connectionId: current.id,
          sourceId: current.sourceId,
          email: current.email,
          exchangeId: current.source === 'inbound' ? current.sourceId : undefined,
        }),
        fetchFollowUps(accessToken, {
          connectionId: current.id,
          sourceId: current.sourceId,
          email: current.email,
          exchangeId: current.source === 'inbound' ? current.sourceId : undefined,
        }),
      ]);
      setMeetings(nextMeetings);
      setAllFollowUps(allFollowUps);
      setFollowUps(allFollowUps);
    } catch {
      setMeetings([]);
      setAllFollowUps([]);
      setFollowUps([]);
    }
  }, [accessToken]);

  const loadCard = useCallback(async (current: ConnectionItem) => {
    if (!accessToken) return;
    setCardLoading(true);
    try {
      const result = await loadConnectionLiveCard(current, accessToken);
      setCard(result.card);
      setCardSlug(result.slug);
    } finally {
      setCardLoading(false);
    }
  }, [accessToken]);

  const loadSavedDirectoryContact = useCallback(async (current: ConnectionItem, slug: string | null) => {
    if (!accessToken) {
      setSavedContact(null);
      return;
    }
    setDirectoryLoading(true);
    try {
      const contacts = await fetchContacts(accessToken);
      setSavedContact(findSavedDirectoryContact(contacts, current, slug));
    } catch {
      setSavedContact(null);
    } finally {
      setDirectoryLoading(false);
    }
  }, [accessToken]);

  const refreshFollowUps = useCallback(async () => {
    if (!accessToken || !connection) return;
    try {
      const nextFollowUps = await fetchFollowUps(accessToken, {
        connectionId: connection.id,
        sourceId: connection.sourceId,
        email: connection.email,
        exchangeId: connection.source === 'inbound' ? connection.sourceId : undefined,
      });
      setAllFollowUps(nextFollowUps);
      setFollowUps(nextFollowUps);
    } catch {
      setAllFollowUps([]);
      setFollowUps([]);
    }
  }, [accessToken, connection]);

  useFocusEffect(
    useCallback(() => {
      void loadConnection();
    }, [loadConnection]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!connection) return;
      void loadCard(connection);
      void loadMeetingsAndFollowUps(connection);
      const interval = setInterval(() => void loadMeetingsAndFollowUps(connection), 30_000);
      return () => clearInterval(interval);
    }, [connection, loadCard, loadMeetingsAndFollowUps]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!connection) return;
      void loadSavedDirectoryContact(connection, cardSlug);
    }, [connection, cardSlug, loadSavedDirectoryContact]),
  );

  const directoryState = useMemo(
    () => (connection ? resolveDirectorySaveState(savedContact, connection, card) : 'unsaved'),
    [savedContact, connection, card],
  );

  const directoryHint = useMemo(
    () => (connection ? directoryUpdateSummary(savedContact, connection, card) : ''),
    [savedContact, connection, card],
  );

  const openFollowUps = useMemo(
    () => followUps.filter(isOpenFollowUp),
    [followUps],
  );
  const followUpPreview = useMemo(() => openFollowUps.slice(0, 2), [openFollowUps]);
  // Quick Follow-up creates a placeholder encounter just to hold its task, but
  // notes-only Capture also has zero duration. Hide only the actual placeholder
  // so a notes capture remains a conversation with its event context.
  const recordedMeetings = useMemo(
    () => meetings.filter(isConversationEncounter),
    [meetings],
  );
  const eventById = useMemo(
    () => new Map(myEvents.map((event) => [event.id, event])),
    [myEvents],
  );
  const timeline = useMemo(() => [
    ...recordedMeetings.map((meeting) => {
      const event = meeting.eventId ? eventById.get(meeting.eventId) : undefined;
      return {
        id: `meeting-${meeting.id}`,
        kind: 'meeting' as const,
        occurredAt: meeting.startedAt,
        title: meeting.title.trim() || 'Meeting',
        copy: meeting.sharedSummary.trim(),
        eventTitle: event?.title || '',
        eventLocation: event?.location || '',
        encounterId: meeting.id,
        meeting,
      };
    }),
    ...followUps
      .filter((item) => item.status === 'completed' && item.completedAt)
      .map((item) => ({
        id: `follow-up-${item.encounterId}-${item.actionId}`,
        kind: 'completed' as const,
        occurredAt: item.completedAt || '',
        title: item.title,
        // No "From {meeting title}" caption here — the meeting itself
        // already appears as its own History cell in this same list, so
        // repeating its title read as duplicated text right next to it.
        copy: '',
        eventTitle: item.eventTitle || '',
        eventLocation: item.eventId ? eventById.get(item.eventId)?.location || '' : '',
        encounterId: item.encounterId,
        meeting: meetings.find((meeting) => meeting.id === item.encounterId) || null,
      })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)), [eventById, followUps, meetings, recordedMeetings]);

  async function confirmDelete() {
    if (!accessToken || !connection) return;
    setDeleting(true);
    try {
      await deleteConnection(accessToken, connection);
      setDeleteOpen(false);
      router.back();
    } catch (caught) {
      showError(describeError(caught, 'Could not remove this connection.'));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  async function saveToDirectory() {
    if (!accessToken || !connection) return;
    setSaving(true);
    try {
      if (directoryState === 'needs_update') {
        await updateConnectionDirectory(accessToken, connection, card, savedContact?.updatedAt);
        showSuccess('Directory updated with the latest card details.');
      } else {
        await saveConnectionToEhllo(accessToken, connection, card);
        await saveConnectionToDeviceContacts(connection, card);
        showSuccess('Saved to your directory.');
      }
      await loadSavedDirectoryContact(connection, cardSlug);
    } catch (caught) {
      const message = describeError(caught, 'Could not save this connection.');
      if (message.toLowerCase().includes('session has expired')) {
        showError('Your app session could not reach ehllo. Sign out from Settings, sign in again, then retry.');
      } else {
        showError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function openMeeting(meeting: EncounterPayload) {
    setActiveMeeting(meeting);
    const uri = await resolveEncounterRecordingUri(meeting.id, meeting.recording);
    setMeetingRecordingUri(uri);
  }

  function runConnectionFollowUp(item: FollowUpItem) {
    if (!connection) return;
    runFollowUp(item, { connection, card });
  }

  const contextLine = connection?.subtitle || connectionSourceLabel(connection?.source || 'met');
  const meetingCountLabel = recordedMeetings.length === 1
    ? '1 conversation'
    : `${recordedMeetings.length} conversations`;
  const latestMeetingPlace = timeline.find((item) => item.kind === 'meeting' && item.eventTitle);
  const latestPlaceTitle = latestMeetingPlace?.eventTitle || connection?.eventTitle || '';
  const latestPlaceLocation = latestMeetingPlace?.eventLocation || connection?.eventLocation || '';

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2 }]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            {connection ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove connection"
                onPress={() => setDeleteOpen(true)}
                style={styles.deleteButton}>
                <Trash size={20} color={colors.danger} weight="bold" />
              </Pressable>
            ) : null}
          </View>
          {connection ? (
            <View style={styles.headerCopy}>
              <Title style={styles.name}>{connection.name}</Title>
              <Eyebrow>{connectionSourceLabel(connection.source)}</Eyebrow>
              <Body>{contextLine}</Body>
              {latestPlaceTitle ? (
                <Text style={styles.eventContext}>
                  Last met at: {latestPlaceTitle}
                  {latestPlaceLocation ? ` · ${latestPlaceLocation}` : ''}
                </Text>
              ) : null}
              {recordedMeetings.length ? <Body style={styles.countLine}>{meetingCountLabel}</Body> : null}
              <View style={styles.relationshipActions}>
                <PillButton
                  tone="solid"
                  style={styles.relationshipActionPill}
                  textStyle={styles.relationshipActionPillText}
                  icon={<Microphone size={18} color={colors.white} weight="fill" />}
                  onPress={() => router.push({
                    pathname: '/capture/new',
                    params: {
                      personName: connection.name,
                      personEmail: connection.email || '',
                      sourceId: connection.sourceId,
                      contactId: connection.source === 'contact' ? connection.sourceId : '',
                      exchange: connection.source === 'inbound' ? connection.sourceId : '',
                    },
                  })}>
                  Capture
                </PillButton>
                <PillButton
                  tone="outline"
                  style={styles.relationshipActionPill}
                  textStyle={styles.relationshipActionPillText}
                  icon={<Plus size={18} color={colors.muted} weight="bold" />}
                  onPress={() => router.push({
                    pathname: '/quick-follow-up',
                    params: {
                      personName: connection.name,
                      personEmail: connection.email || '',
                      sourceId: connection.sourceId,
                      contactId: connection.source === 'contact' ? connection.sourceId : '',
                      exchangeId: connection.source === 'inbound' ? connection.sourceId : '',
                    },
                  })}>
                  Follow-up
                </PillButton>
              </View>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.x6 }]}
          showsVerticalScrollIndicator={false}>
          {loading ? (
            <ConnectionDetailSkeleton />
          ) : connection ? (
            <View style={styles.content}>
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>History</Text>
                  {timeline.length > 2 ? (
                    <Pressable accessibilityRole="button" onPress={() => setMeetingsSheetOpen(true)}>
                      <Text style={styles.viewAll}>View all</Text>
                    </Pressable>
                  ) : null}
                </View>
                {timeline.length ? (
                  timeline.slice(0, 2).map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      onPress={() => item.meeting ? void openMeeting(item.meeting) : undefined}
                      style={({ pressed }) => [styles.meetingCell, pressed && styles.pressed]}>
                      <View style={[styles.timelineMarker, item.kind === 'completed' && styles.timelineMarkerCompleted]}>
                        {item.kind === 'completed'
                          ? <CheckCircle size={17} color={colors.ink} weight="fill" />
                          : <Microphone size={17} color={colors.ink} weight="fill" />}
                      </View>
                      <View style={styles.meetingCopy}>
                        <Text style={styles.meetingTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.meetingMeta}>{item.kind === 'completed' ? 'Follow-up completed' : 'Meeting'} · {formatMeetingDate(item.occurredAt)}</Text>
                        {item.eventTitle ? (
                          <Text style={styles.meetingPlace} numberOfLines={1}>
                            At {item.eventTitle}{item.eventLocation ? ` · ${item.eventLocation}` : ''}
                          </Text>
                        ) : null}
                        {item.copy ? (
                          <Text style={styles.meetingSummary} numberOfLines={2}>{item.copy}</Text>
                        ) : null}
                      </View>
                      <CaretRight size={16} color={colors.muted} weight="bold" />
                    </Pressable>
                  ))
                ) : (
                  <MiniPromptCard
                    icon={<Microphone size={18} color={colors.ink} weight="bold" />}
                    title="No meetings yet"
                    copy={`Capture a conversation with ${connection.name.split(' ')[0] || 'them'}.`}
                    onPress={() => router.push({
                      pathname: '/capture/new',
                      params: {
                        personName: connection.name,
                        personEmail: connection.email || '',
                        sourceId: connection.sourceId,
                        contactId: connection.source === 'contact' ? connection.sourceId : '',
                        exchange: connection.source === 'inbound' ? connection.sourceId : '',
                      },
                    })}
                  />
                )}
              </View>

              {openFollowUps.length ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Follow-ups</Text>
                    {openFollowUps.length > 2 ? (
                      <Pressable accessibilityRole="button" onPress={() => setFollowUpsSheetOpen(true)}>
                        <Text style={styles.viewAll}>View all</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.list}>
                    {followUpPreview.map((item) => (
                      <FollowUpCell
                        key={`${item.encounterId}-${item.actionId}`}
                        item={item}
                      onPress={() => runConnectionFollowUp(item)}
                      onComplete={() => void markComplete(item, refreshFollowUps)}
                      onReopen={() => void markOpen(item, refreshFollowUps)}
                      completing={completingId === `${item.encounterId}-${item.actionId}`}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => setCardSheetOpen(true)}
                style={({ pressed }) => [styles.cardButton, pressed && styles.pressed]}>
                <IdentificationCard size={20} color={colors.white} weight="bold" />
                <View style={styles.cardButtonCopy}>
                  <Text style={styles.cardButtonTitle}>View card & directory</Text>
                  <Text style={styles.cardButtonMeta}>
                    {directoryState === 'saved'
                      ? 'Saved to directory'
                      : directoryState === 'needs_update'
                        ? directoryHint || 'Update directory'
                        : 'Save their card details'}
                  </Text>
                </View>
                <CaretRight size={16} color={colors.muted} weight="bold" />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <ConnectionCardSheet
        visible={cardSheetOpen}
        connection={connection}
        card={cardLoading && !card ? null : card}
        directoryState={directoryState}
        loading={saving || directoryLoading}
        onClose={() => setCardSheetOpen(false)}
        onSaveDirectory={() => void saveToDirectory()}
      />

      <BottomSheet visible={meetingsSheetOpen} title="History" onClose={() => setMeetingsSheetOpen(false)}>
        <View style={styles.list}>
          {timeline.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => {
                setMeetingsSheetOpen(false);
                if (item.meeting) void openMeeting(item.meeting);
              }}
              style={({ pressed }) => [styles.meetingCell, styles.meetingCellSheet, pressed && styles.pressed]}>
              <View style={[styles.timelineMarker, item.kind === 'completed' && styles.timelineMarkerCompleted]}>
                {item.kind === 'completed'
                  ? <CheckCircle size={17} color={colors.ink} weight="fill" />
                  : <Microphone size={17} color={colors.ink} weight="fill" />}
              </View>
              <View style={styles.meetingCopy}>
                <Text style={styles.meetingTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.meetingMeta}>{item.kind === 'completed' ? 'Follow-up completed' : 'Meeting'} · {formatMeetingDate(item.occurredAt)}</Text>
                {item.eventTitle ? (
                  <Text style={styles.meetingPlace} numberOfLines={1}>
                    At {item.eventTitle}{item.eventLocation ? ` · ${item.eventLocation}` : ''}
                  </Text>
                ) : null}
              </View>
              <CaretRight size={16} color={colors.muted} weight="bold" />
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <MeetingDetailSheet
        visible={Boolean(activeMeeting)}
        encounter={activeMeeting}
        recordingUri={meetingRecordingUri}
        eventTitle={activeMeetingEventTitle}
        eventLocation={activeMeetingEventLocation}
        followUps={activeMeeting ? followUps.filter((item) => item.encounterId === activeMeeting.id) : []}
        onClose={() => {
          setActiveMeeting(null);
          setMeetingRecordingUri(null);
        }}
        onPressFollowUp={(item) => {
          // Close this sheet before running the action — it may open another
          // sheet (missing contact info, audience choice), and two RN <Modal>
          // instances visible at once hangs on iOS.
          setActiveMeeting(null);
          setMeetingRecordingUri(null);
          runConnectionFollowUp(item);
        }}
        onCompleteFollowUp={(item) => void markComplete(item, refreshFollowUps)}
        onReopenFollowUp={(item) => void markOpen(item, refreshFollowUps)}
      />

      <FollowUpsSheet
        visible={followUpsSheetOpen}
        title={`Follow-ups · ${connection?.name || ''}`}
        items={openFollowUps}
        onClose={() => setFollowUpsSheetOpen(false)}
        onPressItem={runConnectionFollowUp}
        onCompleteItem={(item) => void markComplete(item, refreshFollowUps)}
        onReopenItem={(item) => void markOpen(item, refreshFollowUps)}
        completingId={completingId}
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

      <ConnectionDeleteSheet
        visible={deleteOpen}
        name={connection?.name || 'this connection'}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
      />

      <OutcomeErrorSheet
        visible={errorSheetOpen}
        message={errorMessage}
        onClose={() => {
          setErrorSheetOpen(false);
          setErrorMessage('');
        }}
      />

      <OutcomeSuccessSheet
        visible={successSheetOpen}
        message={successMessage}
        onClose={() => {
          setSuccessSheetOpen(false);
          setSuccessMessage('');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1 },
  header: { gap: spacing.x3, paddingHorizontal: spacing.x5 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  headerCopy: { gap: spacing.x2 },
  name: { fontSize: 32, lineHeight: 34 },
  countLine: { color: colors.muted, fontSize: 13 },
  eventContext: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  relationshipActions: { flexDirection: 'row', gap: spacing.x2, marginTop: spacing.x1 },
  relationshipActionPill: { paddingHorizontal: spacing.x5, paddingVertical: spacing.x3 },
  relationshipActionPillText: { fontSize: 14 },
  scroll: { flex: 1, marginTop: spacing.x5 },
  scrollContent: { paddingHorizontal: spacing.x5, gap: spacing.x3 },
  content: { gap: spacing.x5 },
  section: { gap: spacing.x3 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  viewAll: { color: colors.link, fontSize: 13, fontWeight: '800' },
  list: { gap: spacing.x3 },
  meetingCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
  },
  // The History bottom sheet has no other surface to separate cells from —
  // unlike the same list embedded in the page, it reads as too flat/white
  // without a border here.
  meetingCellSheet: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  timelineMarker: {
    width: 34,
    height: 34,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  timelineMarkerCompleted: { backgroundColor: colors.accent },
  pressed: { opacity: 0.86 },
  meetingCopy: { flex: 1, gap: 2 },
  meetingTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  meetingMeta: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  meetingPlace: { color: colors.inkSoft, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  meetingSummary: { color: colors.inkSoft, fontSize: 13, lineHeight: 18 },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.ink,
  },
  cardButtonCopy: { flex: 1, gap: 2 },
  cardButtonTitle: { color: colors.white, fontSize: 15, fontWeight: '800' },
  cardButtonMeta: { color: '#C5D3BF', fontSize: 12, lineHeight: 16 },
});

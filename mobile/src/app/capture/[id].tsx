import { router, useLocalSearchParams } from 'expo-router';
import { CalendarBlank, CaretDown, CaretUp, CheckCircle, CloudArrowUp, EnvelopeSimple, PencilSimple, Plus, ShareNetwork, Trash } from 'phosphor-react-native';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { CollapsibleTranscriptSection } from '@/components/collapsible-transcript-section';
import { SpeakerIdentityEditor } from '@/components/speaker-identity-editor';
import { renameSpeakerAssignees } from '@/features/encounters/speaker-labels';
import { FollowUpDuePicker } from '@/components/follow-up-due-picker';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { RecordingPlayback } from '@/components/recording-playback';
import { ConnectionDetailSkeleton } from '@/components/skeleton';
import { Body, Button, PageHeader, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { clearActiveCaptureController } from '@/features/encounters/active-capture-controller';
import {
  resolveEncounterRecordingUri,
  updateLocalRecordingSharedUrl,
} from '@/features/encounters/local-recordings';
import {
  EncounterConflictError,
  getEncounter,
  saveEncounter,
  uploadEncounterRecording,
  type EncounterPayload,
} from '@/features/encounters/encounter-api';
import { fetchMyEvents, type EventItem } from '@/features/events/events-api';
import {
  defaultFollowUpTitle,
  FOLLOW_UP_CHANNELS,
  SELECTABLE_FOLLOW_UP_CHANNELS,
  type FollowUpChannel,
} from '@/features/follow-ups/follow-up-channels';
import { formatDueLabel } from '@/lib/due-date';
import { openEmailCompose } from '@/lib/email-compose';
import { readEnv } from '@/lib/env';
import { buildRecordingShareEmail, formatMeetingEmailDate } from '@/lib/recording-email';
import {
  CLOUD_RECORDING_RETENTION_DAYS,
  formatCloudAvailableUntil,
  isCloudRecordingExpired,
} from '@/lib/recording-metadata';
import { colors, radius, spacing } from '@/theme/tokens';

type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'failed' | 'none';

export default function CaptureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [encounter, setEncounter] = useState<EncounterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState('');
  const [uploadRetryable, setUploadRetryable] = useState(true);
  const [approveHint, setApproveHint] = useState('');
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successSheetOpen, setSuccessSheetOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'recap' | 'transcript' | 'details'>('recap');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [actionComposerOpen, setActionComposerOpen] = useState(false);
  const [editingActionId, setEditingActionId] = useState('');
  const [newActionDetailOpen, setNewActionDetailOpen] = useState(false);
  const [actionDetailOpen, setActionDetailOpen] = useState<Record<string, boolean>>({});
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionChannel, setNewActionChannel] = useState<FollowUpChannel>('email');
  const [newActionOwner, setNewActionOwner] = useState<'me' | 'guest'>('me');
  const [newActionDueAt, setNewActionDueAt] = useState('');
  const [newActionParticipantId, setNewActionParticipantId] = useState('');
  const [myEvents, setMyEvents] = useState<EventItem[]>([]);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    void fetchMyEvents(session.access_token).then(setMyEvents).catch(() => undefined);
  }, [session?.access_token]);

  const attachedEventTitle = encounter?.eventId
    ? myEvents.find((event) => event.id === encounter.eventId)?.title ?? ''
    : '';

  const guestUrl = encounter && readEnv()
    ? `${readEnv()!.publicCardBaseUrl}/e/${encounter.shareToken}`
    : '';

  const isShared = encounter?.status === 'shared';
  const isReviewed = encounter?.status === 'reviewed' || isShared;
  const cloudReady = Boolean(
    uploadStatus === 'uploaded'
    || encounter?.recording?.sharedAudioUrl
    || encounter?.recording?.storagePath,
  );
  const cloudAvailableUntil = formatCloudAvailableUntil(encounter?.recording?.cloudExpiresAt);
  const cloudExpired = isCloudRecordingExpired(encounter?.recording?.cloudExpiresAt);

  async function syncUpload(
    accessToken: string,
    encounterId: string,
    localUri: string,
    mimeType?: string,
  ) {
    setUploadStatus('uploading');
    setUploadError('');
    try {
      const uploaded = await uploadEncounterRecording(accessToken, encounterId, localUri);
      await updateLocalRecordingSharedUrl(encounterId, uploaded.sharedAudioUrl ?? '', uploaded);
      setEncounter((current) => current ? {
        ...current,
        recording: {
          ...(current.recording ?? {
            id: current.id,
            durationSeconds: current.durationSeconds,
            fileSize: 0,
            mimeType: mimeType || 'audio/mp4',
            source: 'recorded',
            retention: '7_days',
            expiresAt: null,
            createdAt: current.startedAt,
            localUri,
          }),
          ...uploaded,
          localUri,
          audioLocation: 'server',
        },
      } : current);
      setUploadStatus('uploaded');
      return uploaded;
    } catch (caught) {
      setUploadStatus('failed');
      setUploadRetryable((caught as Error & { retryable?: boolean })?.retryable !== false);
      setUploadError(caught instanceof Error ? caught.message : 'Could not upload recording for guests.');
      return null;
    }
  }

  useEffect(() => {
    if (!session?.access_token || !id) {
      void Promise.resolve().then(() => {
        setLoading(false);
        setRecordingLoading(false);
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const nextEncounter = await getEncounter(session.access_token!, id);
        if (cancelled) return;
        setEncounter(nextEncounter);

        const uri = await resolveEncounterRecordingUri(id, nextEncounter.recording);
        if (cancelled) return;
        setRecordingUri(uri);
        setRecordingLoading(false);

        if (nextEncounter.recording?.sharedAudioUrl || nextEncounter.recording?.storagePath) {
          setUploadStatus('uploaded');
        } else if (uri?.startsWith('file')) {
          void syncUpload(session.access_token!, nextEncounter.id, uri, nextEncounter.recording?.mimeType);
        } else if (nextEncounter.durationSeconds > 0 || nextEncounter.recording) {
          setUploadStatus('none');
        } else {
          setUploadStatus('none');
        }
      } catch (caught) {
        if (cancelled) return;
        setErrorMessage(caught instanceof Error ? caught.message : 'Could not load this meeting.');
        setErrorSheetOpen(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRecordingLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, session?.access_token]);

  const recordingDuration = useMemo(
    () => encounter?.durationSeconds || encounter?.recording?.durationSeconds || 0,
    [encounter?.durationSeconds, encounter?.recording?.durationSeconds],
  );

  const expectsAudio = Boolean(
    recordingUri
    || encounter?.recording?.storagePath
    || encounter?.recording?.sharedAudioUrl
    || encounter?.recording?.localUri
    || (encounter?.durationSeconds ?? 0) > 0
    || Boolean(encounter?.recording),
  );
  const hasTranscript = Boolean(encounter?.transcript.trim());

  const needsUpload = Boolean(
    recordingUri?.startsWith('file')
    && !cloudReady
    && uploadStatus !== 'uploaded',
  );
  /**
   * Saves with optimistic-concurrency protection: if this encounter changed
   * on another device since it was loaded here, the server rejects the
   * write (409) instead of silently overwriting it. On conflict, the server
   * record wins — reload it and surface a clear, recoverable message rather
   * than losing either device's edit silently.
   */
  async function saveWithConflictGuard(next: EncounterPayload): Promise<EncounterPayload | null> {
    if (!session?.access_token) return null;
    try {
      const result = await saveEncounter(session.access_token, next, { expectedUpdatedAt: encounter?.updatedAt });
      // Picks up the server's passive-presence guess on first save (see
      // resolveCurrentEventIdForUser) without a separate refetch — next.eventId
      // stays authoritative whenever the client sent an explicit opinion.
      const saved = {
        ...next,
        updatedAt: result.updatedAt ?? next.updatedAt,
        eventId: next.eventId !== undefined ? next.eventId : (result.eventId ?? undefined),
      };
      setEncounter(saved);
      return saved;
    } catch (caught) {
      if (caught instanceof EncounterConflictError) {
        try {
          const latest = await getEncounter(session.access_token, next.id);
          setEncounter(latest);
        } catch {
          // If the reload itself fails, at least the stale local edit was not written over the server's copy.
        }
        setErrorMessage('This meeting changed on another device. We loaded the latest version below. Please redo your change if it’s still needed.');
        setErrorSheetOpen(true);
        return null;
      }
      throw caught;
    }
  }

  function toggleGuestSharing(next: boolean) {
    setApproveHint('');

    if (next) {
      if (needsUpload && recordingUri && session?.access_token && encounter) {
        void syncUpload(session.access_token, encounter.id, recordingUri, encounter.recording?.mimeType);
      }
      return;
    }

    if (isShared && encounter && session?.access_token) {
      const reverted = { ...encounter, status: 'reviewed' as const };
      setApproving(true);
      saveWithConflictGuard(reverted)
        .catch((caught) => {
          setErrorMessage(caught instanceof Error ? caught.message : 'Could not turn off guest sharing.');
          setErrorSheetOpen(true);
        })
        .finally(() => setApproving(false));
    }
  }

  async function persist(next: EncounterPayload) {
    if (!session?.access_token) return;
    setSaving(true);
    setApproveHint('');
    try {
      const saved = await saveWithConflictGuard(next);
      if (saved) {
        setSuccessMessage('Changes saved.');
        setSuccessSheetOpen(true);
      }
    } catch (caught) {
      setErrorMessage(caught instanceof Error ? caught.message : 'Could not save changes.');
      setErrorSheetOpen(true);
    } finally {
      setSaving(false);
    }
  }

  function addAction() {
    if (!encounter) return;
    const participant = encounter.participants.find((person) => person.id === newActionParticipantId)
      ?? encounter.participants[0];
    setEncounter({
      ...encounter,
      actions: [...encounter.actions, {
        id: `action-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: newActionTitle.trim() || defaultFollowUpTitle(newActionChannel),
        channel: newActionChannel,
        owner: newActionOwner,
        dueAt: newActionDueAt,
        // A follow-up added before review is confirmed is still just a
        // proposal, same as the ones suggested from the transcript.
        status: encounter.status === 'draft' ? 'proposed' : 'open',
        participantId: participant?.id,
        assigneeName: participant?.name,
        assigneeEmail: participant?.email,
      }],
    });
    setNewActionTitle('');
    setNewActionChannel('email');
    setNewActionOwner('me');
    setNewActionDueAt('');
    setNewActionParticipantId('');
    setNewActionDetailOpen(false);
    setActionComposerOpen(false);
  }

  // A still-proposed action is awaiting review confirmation and cannot jump
  // straight to completed — it has to be activated (open) first, same as
  // the server-side transition table enforces.
  function canToggleAction(status: EncounterPayload['actions'][number]['status']) {
    return status !== 'proposed';
  }

  function toggleAction(actionId: string) {
    if (!encounter) return;
    setEncounter({
      ...encounter,
      actions: encounter.actions.map((action) => {
        if (action.id !== actionId || !canToggleAction(action.status)) return action;
        return action.status === 'completed'
          ? { ...action, status: 'open', completedAt: undefined }
          : { ...action, status: 'completed', completedAt: new Date().toISOString() };
      }),
    });
  }

  function removeAction(actionId: string) {
    if (!encounter) return;
    setEncounter({ ...encounter, actions: encounter.actions.filter((action) => action.id !== actionId) });
  }

  function updateAction(actionId: string, update: Partial<EncounterPayload['actions'][number]>) {
    if (!encounter) return;
    setEncounter({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId ? { ...action, ...update } : action),
    });
  }

  async function confirmReview() {
    if (!encounter || !session?.access_token || isReviewed) return;
    setApproveHint('');
    const next = { ...encounter, status: 'reviewed' as const };
    setConfirmingReview(true);
    try {
      const saved = await saveWithConflictGuard(next);
      if (saved) {
        clearActiveCaptureController(saved.id);
        setSuccessMessage('Review confirmed. Your follow-ups are now active.');
        setSuccessSheetOpen(true);
      }
    } catch (caught) {
      setErrorMessage(caught instanceof Error ? caught.message : 'Could not confirm this review.');
      setErrorSheetOpen(true);
    } finally {
      setConfirmingReview(false);
    }
  }

  async function approveAndShare() {
    if (!encounter || !session?.access_token) return;
    setApproveHint('');

    if (!encounter.sharedSummary.trim()) {
      setApproveHint('Add a short share summary below, then approve.');
      return;
    }

    if (uploadStatus === 'uploading') {
      setApproveHint('Recording is still uploading. Approve unlocks once it finishes.');
      return;
    }

    if (needsUpload && recordingUri) {
      const uploaded = await syncUpload(
        session.access_token,
        encounter.id,
        recordingUri,
        encounter.recording?.mimeType,
      );
      if (!uploaded) {
        setApproveHint('The recording could not be prepared for sharing. Retry the upload below.');
        return;
      }
    }

    const next = { ...encounter, status: 'shared' as const };
    setApproving(true);
    try {
      const saved = await saveWithConflictGuard(next);
      if (saved) {
        setApproveHint('');
        setSuccessMessage('Guest view approved.');
        setSuccessSheetOpen(true);
      }
    } catch (caught) {
      setErrorMessage(caught instanceof Error ? caught.message : 'Could not approve the guest view.');
      setErrorSheetOpen(true);
    } finally {
      setApproving(false);
    }
  }

  async function shareGuestLink() {
    if (!guestUrl || !encounter || !isShared) return;
    await Share.share({
      title: `${encounter.personName || encounter.title} · ehllo`,
      message: guestUrl,
      url: guestUrl,
    });
  }

  async function emailRecordingWithDetails() {
    if (!encounter || !guestUrl) return;
    const email = buildRecordingShareEmail({
      title: encounter.title,
      personName: encounter.personName,
      personEmail: encounter.personEmail,
      guestUrl,
      sharedSummary: encounter.sharedSummary,
      meetingDate: formatMeetingEmailDate(encounter.startedAt),
      cloudExpired: isCloudRecordingExpired(encounter.recording?.cloudExpiresAt),
    });
    await openEmailCompose(email);
  }

  async function shareRecordingFile() {
    if (!recordingUri || !encounter) return;
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(recordingUri, {
        mimeType: encounter.recording?.mimeType || 'audio/mp4',
        dialogTitle: Platform.OS === 'ios' ? 'Save recording to Files or iCloud Drive' : 'Send meeting recording',
      });
      return;
    }
    await Share.share({
      title: `${encounter.title} recording`,
      message: encounter.sharedSummary || encounter.title,
      url: recordingUri,
    });
  }

  if (loading) {
    return (
      <Screen edges={['top', 'bottom']} reserveTabBar={false}>
        <PageHeader eyebrow="Previous capture" title="Loading capture" titleStyle={styles.title} />
        <ConnectionDetailSkeleton />
      </Screen>
    );
  }

  if (!session || !encounter) {
    return (
      <Screen edges={['top', 'bottom']} reserveTabBar={false}>
        <PageHeader eyebrow="Previous" title="Meeting not available" titleStyle={styles.title} />
        <Body>{errorMessage || 'Sign in to view this meeting.'}</Body>
        {!session ? <Button onPress={() => router.push('/auth')}>Sign in</Button> : null}
        <Button variant="secondary" onPress={() => router.back()}>Go back</Button>
        <OutcomeErrorSheet
          visible={errorSheetOpen}
          message={errorMessage}
          onClose={() => {
            setErrorSheetOpen(false);
            setErrorMessage('');
          }}
        />
      </Screen>
    );
  }

  const showEmailRecording = Boolean(
    recordingUri
    && (cloudExpired || uploadStatus === 'failed' || !encounter.recording?.sharedAudioUrl),
  );
  const openActions = encounter.actions.filter((action) => action.status !== 'completed');
  const peopleCount = encounter.participants.length || (encounter.personName ? 1 : 0);

  const footer = !isReviewed ? (
    <>
      <Button loading={confirmingReview} onPress={() => void confirmReview()}>
        Confirm review
      </Button>
      <Button variant="secondary" loading={saving} onPress={() => void persist(encounter)}>
        Save without confirming
      </Button>
    </>
  ) : (
    <>
      <Button onPress={() => router.replace('/(tabs)')}>Done</Button>
      <Button variant="secondary" loading={saving} onPress={() => void persist(encounter)}>
        Save changes
      </Button>
    </>
  );

  const header = (
    <>
      <PageHeader
        eyebrow={isShared ? 'Guest view shared' : isReviewed ? 'Reviewed · private' : 'Pending review'}
        title={encounter.personName || encounter.title}
        titleStyle={styles.title}
      />

      <View style={styles.reviewStatusLine} accessibilityLabel={`${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}, ${openActions.length} follow-ups`}>
        <Text style={styles.reviewStatusText}>{peopleCount} {peopleCount === 1 ? 'person' : 'people'}</Text>
        <View style={styles.reviewStatusDot} />
        <Text style={styles.reviewStatusText}>
          {openActions.length} follow-up{openActions.length === 1 ? '' : 's'}{isReviewed ? '' : ' (pending)'}
        </Text>
      </View>

      {attachedEventTitle || myEvents.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={attachedEventTitle ? `Event: ${attachedEventTitle}. Change` : 'Add event context'}
          onPress={() => setEventPickerOpen(true)}
          style={styles.eventChip}>
          <CalendarBlank size={14} color={colors.ink} weight="bold" />
          <Text style={styles.eventChipText} numberOfLines={1}>{attachedEventTitle || 'No event'}</Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <Screen edges={['top', 'bottom']} reserveTabBar={false} footer={footer} header={header}>
      <Panel style={styles.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: notesExpanded }}
          onPress={() => setNotesExpanded((value) => !value)}
          style={styles.notesToggle}>
          <View style={styles.notesToggleCopy}>
            <Text style={styles.sectionTitle}>Meeting notes</Text>
            <Text style={styles.helperCopy}>Recap, transcript, and details</Text>
          </View>
          {notesExpanded ? (
            <CaretUp size={18} color={colors.ink} weight="bold" />
          ) : (
            <CaretDown size={18} color={colors.ink} weight="bold" />
          )}
        </Pressable>

        {notesExpanded ? (
          <>
        <View style={styles.tabRow}>
          {([
            { id: 'recap', label: 'Recap' },
            { id: 'transcript', label: 'Transcript' },
            { id: 'details', label: 'Details' },
          ] as const).map((tab) => (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.id }}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tabButton, activeTab === tab.id && styles.tabButtonActive]}>
              <Text style={[styles.tabButtonText, activeTab === tab.id && styles.tabButtonTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'recap' ? (
          <View style={styles.tabPane}>
            {expectsAudio ? (
              recordingLoading ? (
                <View style={styles.recordingLoading}>
                  <ActivityIndicator color={colors.ink} />
                  <Text style={styles.recordingMissing}>Loading recording…</Text>
                </View>
              ) : recordingUri ? (
                <RecordingPlayback uri={recordingUri} durationSeconds={recordingDuration} variant="compact" />
              ) : (
                <Text style={styles.recordingMissing}>Audio is not available on this device.</Text>
              )
            ) : null}
            <Text style={styles.helperCopy}>What participants will see if you share this meeting.</Text>
            <TextInput
              value={encounter.sharedSummary}
              onChangeText={(value) => {
                setApproveHint('');
                setEncounter({ ...encounter, sharedSummary: value });
              }}
              multiline
              scrollEnabled
              placeholder="What you discussed, decided, and who owns what next…"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.notesField]}
            />
          </View>
        ) : null}

        {activeTab === 'transcript' ? (
          <View style={styles.tabPane}>
            {hasTranscript ? (
              <>
                <SpeakerIdentityEditor
                  key={encounter.transcript}
                  transcript={encounter.transcript}
                  attendeeNames={[encounter.personName, ...encounter.participants.map((person) => person.name)]}
                  onApply={(value, names) => setEncounter({
                    ...encounter,
                    transcript: value,
                    actions: renameSpeakerAssignees(encounter.actions, names, encounter.participants),
                  })}
                />
                <CollapsibleTranscriptSection
                  title="Full transcript"
                  hint="Expand to edit the full transcript"
                  value={encounter.transcript}
                  onChangeText={(value) => setEncounter({ ...encounter, transcript: value })}
                  defaultOpen={false}
                />
              </>
            ) : <Text style={styles.helperCopy}>No transcript saved for this meeting.</Text>}
          </View>
        ) : null}

        {activeTab === 'details' ? (
          <View style={styles.tabPane}>
            <Text style={styles.label}>Private notes</Text>
            <Text style={styles.helperCopy}>Drafted from the transcript for you only. Participants never see this.</Text>
            <TextInput
              value={encounter.privateNotes}
              onChangeText={(value) => setEncounter({ ...encounter, privateNotes: value })}
              multiline
              scrollEnabled
              placeholder="Anything only you need to remember…"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.privateNotesField]}
            />
          </View>
        ) : null}
          </>
        ) : null}
      </Panel>

      <Panel style={styles.section}>
        <Text style={styles.sectionTitle}>Follow-ups</Text>
        <Text style={styles.label}>Commitments</Text>
        {encounter.actions.length ? (
          <View style={styles.actionList}>
            {encounter.actions.map((action) => {
              const participant = encounter.participants.find((person) => person.id === action.participantId);
              const channelLabel = FOLLOW_UP_CHANNELS.find((channel) => channel.id === action.channel)?.label || action.channel;
              return (
                <View key={action.id} style={styles.actionItem}>
                  <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: action.status === 'completed', disabled: !canToggleAction(action.status) }}
                    accessibilityLabel={canToggleAction(action.status)
                      ? `${action.status === 'completed' ? 'Reopen' : 'Complete'} ${action.title}`
                      : `Confirm review to activate ${action.title} first`}
                    disabled={!canToggleAction(action.status)}
                    onPress={() => toggleAction(action.id)}>
                    <CheckCircle size={22} color={action.status === 'completed' ? colors.accent : colors.muted} weight={action.status === 'completed' ? 'fill' : 'regular'} />
                  </Pressable>
                  <View style={styles.actionCopy}>
                    <Text style={[styles.actionTitle, action.status === 'completed' && styles.actionTitleDone]}>{action.title}</Text>
                    <Text style={styles.helperCopy}>{action.owner === 'me' ? participant?.name ? `You → ${participant.name}` : 'You' : participant?.name || action.assigneeName || 'Guest'} · {channelLabel}{action.dueAt ? ` · ${formatDueLabel(action.dueAt)}` : ''}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${action.title}`}
                    accessibilityState={{ expanded: editingActionId === action.id }}
                    onPress={() => setEditingActionId((current) => current === action.id ? '' : action.id)}
                    hitSlop={8}>
                    <PencilSimple size={19} color={colors.ink} weight="bold" />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${action.title}`} onPress={() => removeAction(action.id)} hitSlop={8}>
                    <Trash size={19} color={colors.muted} />
                  </Pressable>
                  </View>
                  <BottomSheet
                    visible={editingActionId === action.id}
                    title="Edit follow-up"
                    onClose={() => setEditingActionId('')}
                    footer={<Button onPress={() => setEditingActionId('')}>Done</Button>}>
                    {(() => {
                      const pronoun = action.owner === 'me' ? 'you' : 'they';
                      return (
                        <>
                          <View style={styles.fieldGroup}>
                            <Text style={styles.label}>Owner</Text>
                            <View style={styles.choiceRow}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ selected: action.owner === 'me' }}
                                onPress={() => updateAction(action.id, { owner: 'me' })}
                                style={[styles.choiceChip, action.owner === 'me' && styles.choiceChipActive]}>
                                <Text style={[styles.choiceChipText, action.owner === 'me' && styles.choiceChipTextActive]}>Me</Text>
                              </Pressable>
                              {encounter.participants.length ? encounter.participants.map((person) => {
                                const selected = action.owner === 'guest' && action.participantId === person.id;
                                return (
                                  <Pressable
                                    key={person.id}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    onPress={() => updateAction(action.id, {
                                      owner: 'guest',
                                      participantId: person.id,
                                      assigneeName: person.name,
                                      assigneeEmail: person.email,
                                    })}
                                    style={[styles.choiceChip, selected && styles.choiceChipActive]}>
                                    <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{person.name || 'Guest'}</Text>
                                  </Pressable>
                                );
                              }) : (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: action.owner === 'guest' }}
                                  onPress={() => updateAction(action.id, { owner: 'guest', assigneeName: encounter.personName || 'Guest' })}
                                  style={[styles.choiceChip, action.owner === 'guest' && styles.choiceChipActive]}>
                                  <Text style={[styles.choiceChipText, action.owner === 'guest' && styles.choiceChipTextActive]}>{encounter.personName || 'Guest'}</Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                          {action.owner === 'me' && encounter.participants.length > 1 ? (
                            <View style={styles.fieldGroup}>
                              <Text style={styles.label}>For person</Text>
                              <View style={styles.choiceRow}>
                                {encounter.participants.map((person) => {
                                  const selected = (action.participantId || encounter.participants[0]?.id) === person.id;
                                  return (
                                    <Pressable
                                      key={person.id}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected }}
                                      onPress={() => updateAction(action.id, {
                                        participantId: person.id,
                                        assigneeName: person.name,
                                        assigneeEmail: person.email,
                                      })}
                                      style={[styles.choiceChip, selected && styles.choiceChipActive]}>
                                      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{person.name || 'Guest'}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ) : null}
                          <View style={styles.fieldGroup}>
                            <Text style={styles.label}>How do {pronoun} want to follow up?</Text>
                            <View style={styles.choiceRow}>
                              {SELECTABLE_FOLLOW_UP_CHANNELS.map((channel) => {
                                const selected = action.channel === channel.id;
                                return (
                                  <Pressable
                                    key={channel.id}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    onPress={() => updateAction(action.id, { channel: channel.id })}
                                    style={[styles.choiceChip, selected && styles.choiceChipActive]}>
                                    <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{channel.label}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                          <FollowUpDuePicker
                            dueAt={action.dueAt || ''}
                            onChange={(dueAt) => updateAction(action.id, { dueAt })}
                            label={`When should ${pronoun} do this?`}
                          />
                          <View style={styles.fieldGroup}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ expanded: Boolean(actionDetailOpen[action.id]) }}
                              onPress={() => setActionDetailOpen((current) => ({ ...current, [action.id]: !current[action.id] }))}
                              style={styles.detailToggle}>
                              <Text style={styles.label}>What do {pronoun} need to do? (optional)</Text>
                              {actionDetailOpen[action.id] ? (
                                <CaretUp size={16} color={colors.ink} weight="bold" />
                              ) : (
                                <CaretDown size={16} color={colors.ink} weight="bold" />
                              )}
                            </Pressable>
                            {actionDetailOpen[action.id] ? (
                              <>
                                <Text style={styles.fieldHint}>Shown in your reminders so you know what this one&apos;s about.</Text>
                                <TextInput
                                  value={action.title}
                                  onChangeText={(value) => updateAction(action.id, { title: value })}
                                  placeholder="e.g. Send the product draft"
                                  placeholderTextColor={colors.muted}
                                  style={styles.input}
                                />
                              </>
                            ) : null}
                          </View>
                        </>
                      );
                    })()}
                  </BottomSheet>
                </View>
              );
            })}
          </View>
        ) : <Text style={styles.helperCopy}>No next actions yet.</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={() => setActionComposerOpen(true)}
          style={styles.actionComposerToggle}>
          <View style={styles.actionComposerToggleCopy}>
            <Plus size={17} color={colors.ink} weight="bold" />
            <Text style={styles.actionComposerToggleText}>Add another follow-up</Text>
          </View>
        </Pressable>
        <BottomSheet
          visible={actionComposerOpen}
          title="Add a follow-up"
          onClose={() => setActionComposerOpen(false)}
          footer={
            <Button onPress={addAction}>
              <Plus size={18} color={colors.ink} weight="bold" />
              Add follow-up
            </Button>
          }>
          {(() => {
            const pronoun = newActionOwner === 'me' ? 'you' : 'they';
            return (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Owner</Text>
                  <View style={styles.choiceRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: newActionOwner === 'me' }}
                      onPress={() => setNewActionOwner('me')}
                      style={[styles.choiceChip, newActionOwner === 'me' && styles.choiceChipActive]}>
                      <Text style={[styles.choiceChipText, newActionOwner === 'me' && styles.choiceChipTextActive]}>Me</Text>
                    </Pressable>
                    {encounter.participants.length ? encounter.participants.map((person) => {
                      const selected = newActionOwner === 'guest' && newActionParticipantId === person.id;
                      return (
                        <Pressable
                          key={person.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setNewActionOwner('guest');
                            setNewActionParticipantId(person.id);
                          }}
                          style={[styles.choiceChip, selected && styles.choiceChipActive]}>
                          <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{person.name || 'Guest'}</Text>
                        </Pressable>
                      );
                    }) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: newActionOwner === 'guest' }}
                        onPress={() => setNewActionOwner('guest')}
                        style={[styles.choiceChip, newActionOwner === 'guest' && styles.choiceChipActive]}>
                        <Text style={[styles.choiceChipText, newActionOwner === 'guest' && styles.choiceChipTextActive]}>{encounter.personName || 'Guest'}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                {newActionOwner === 'me' && encounter.participants.length > 1 ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>For person</Text>
                    <View style={styles.choiceRow}>
                      {encounter.participants.map((person) => {
                        const selected = (newActionParticipantId || encounter.participants[0]?.id) === person.id;
                        return (
                          <Pressable
                            key={person.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => setNewActionParticipantId(person.id)}
                            style={[styles.choiceChip, selected && styles.choiceChipActive]}>
                            <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>{person.name || 'Guest'}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>How do {pronoun} want to follow up?</Text>
                  <View style={styles.choiceRow}>
                    {SELECTABLE_FOLLOW_UP_CHANNELS.map((channel) => (
                      <Pressable
                        key={channel.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: newActionChannel === channel.id }}
                        onPress={() => setNewActionChannel(channel.id)}
                        style={[styles.choiceChip, newActionChannel === channel.id && styles.choiceChipActive]}>
                        <Text style={[styles.choiceChipText, newActionChannel === channel.id && styles.choiceChipTextActive]}>{channel.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <FollowUpDuePicker
                  dueAt={newActionDueAt}
                  onChange={setNewActionDueAt}
                  label={`When should ${pronoun} do this?`}
                />
                <View style={styles.fieldGroup}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: newActionDetailOpen }}
                    onPress={() => setNewActionDetailOpen((value) => !value)}
                    style={styles.detailToggle}>
                    <Text style={styles.label}>What do {pronoun} need to do? (optional)</Text>
                    {newActionDetailOpen ? (
                      <CaretUp size={16} color={colors.ink} weight="bold" />
                    ) : (
                      <CaretDown size={16} color={colors.ink} weight="bold" />
                    )}
                  </Pressable>
                  {newActionDetailOpen ? (
                    <>
                      <Text style={styles.fieldHint}>Shown in your reminders so you know what this one&apos;s about.</Text>
                      <TextInput
                        value={newActionTitle}
                        onChangeText={setNewActionTitle}
                        placeholder="e.g. Send the product draft"
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                      />
                    </>
                  ) : null}
                </View>
              </>
            );
          })()}
        </BottomSheet>
        {encounter.guestFollowUp?.committedAt ? (
          <View style={styles.statusRow}>
            <CheckCircle size={18} color={colors.accent} weight="fill" />
            <Text style={styles.summaryCopy}>
              Your guest said they&apos;ll follow up too{encounter.guestFollowUp.note ? `: "${encounter.guestFollowUp.note}"` : '.'}{encounter.guestFollowUp.channel ? ` · ${encounter.guestFollowUp.channel}` : ''}{encounter.guestFollowUp.dueAt ? ` · due ${encounter.guestFollowUp.dueAt}` : ''}
            </Text>
          </View>
        ) : null}
      </Panel>

      <Panel style={styles.section}>
        <View style={styles.shareToggleRow}>
          <View style={styles.linkCopy}>
            <Text style={styles.sectionTitle}>Share with participants</Text>
            <Text style={styles.linkHint}>
              {isShared
                ? 'Guests can view the recap and recording.'
                : 'Creates a guest link. Also confirms your review.'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Share with participants"
            value={isShared}
            disabled={approving || uploadStatus === 'uploading'}
            onValueChange={(next) => (next ? void approveAndShare() : toggleGuestSharing(false))}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.white}
          />
        </View>
        {uploadStatus === 'uploading' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.ink} size="small" />
            <Text style={styles.helperCopy}>Uploading recording for guest sharing…</Text>
          </View>
        ) : null}
        {uploadStatus === 'failed' ? (
          <View style={styles.uploadFailed}>
            <Text style={styles.uploadFailedText}>{uploadError || 'Upload failed.'}</Text>
            {recordingUri && uploadRetryable ? (
              <Button
                variant="secondary"
                onPress={() => void syncUpload(
                  session.access_token!,
                  encounter.id,
                  recordingUri,
                  encounter.recording?.mimeType,
                )}>
                <CloudArrowUp size={18} color={colors.ink} />
                Retry upload
              </Button>
            ) : null}
          </View>
        ) : null}
        {approveHint ? <Text style={styles.approveHint}>{approveHint}</Text> : null}
        {isShared && guestUrl ? (
          <Button variant="secondary" onPress={() => void shareGuestLink()}>
            <ShareNetwork size={18} color={colors.ink} />
            Share guest link
          </Button>
        ) : null}
        {cloudReady && cloudAvailableUntil && !cloudExpired ? (
          <Text style={styles.helperCopy}>
            Cloud recording available until {cloudAvailableUntil} ({CLOUD_RECORDING_RETENTION_DAYS} days).
          </Text>
        ) : null}
        {cloudExpired ? (
          <Text style={styles.helperCopy}>
            The cloud recording expired. Guests still see the shared summary. You can play it locally on this phone.
          </Text>
        ) : null}
        {showEmailRecording ? (
          <>
            <Text style={[styles.label, styles.guestShareLabel]}>Or share the recording another way</Text>
            <View style={styles.secondaryActionsRow}>
              <Button variant="ghost" style={styles.secondaryActionsRowItem} onPress={() => void emailRecordingWithDetails()}>
                <EnvelopeSimple size={18} color={colors.ink} />
                Email
              </Button>
              <Button variant="ghost" style={styles.secondaryActionsRowItem} onPress={() => void shareRecordingFile()}>
                <ShareNetwork size={18} color={colors.ink} />
                {Platform.OS === 'ios' ? 'Save to Files / iCloud' : 'Send file'}
              </Button>
            </View>
          </>
        ) : null}
      </Panel>

      <BottomSheet
        visible={eventPickerOpen}
        title="Event context"
        onClose={() => setEventPickerOpen(false)}>
        <View style={styles.eventPickerList}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setEncounter((current) => (current ? { ...current, eventId: '' } : current));
              setEventPickerOpen(false);
            }}
            style={styles.eventPickerRow}>
            <Text style={styles.eventPickerRowText}>No event</Text>
            {!encounter?.eventId ? <CheckCircle size={18} color={colors.accent} weight="fill" /> : null}
          </Pressable>
          {myEvents.map((event) => (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              onPress={() => {
                setEncounter((current) => (current ? { ...current, eventId: event.id } : current));
                setEventPickerOpen(false);
              }}
              style={styles.eventPickerRow}>
              <Text style={styles.eventPickerRowText} numberOfLines={1}>{event.title}</Text>
              {encounter?.eventId === event.id ? <CheckCircle size={18} color={colors.accent} weight="fill" /> : null}
            </Pressable>
          ))}
        </View>
      </BottomSheet>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 32 },
  reviewStatusLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.x2 },
  reviewStatusText: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  reviewStatusDot: { width: 3, height: 3, borderRadius: radius.round, backgroundColor: colors.muted },
  eventChip: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.x2,
    paddingHorizontal: spacing.x3,
    paddingVertical: 6,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  eventChipText: { color: colors.ink, fontSize: 12, fontWeight: '700', maxWidth: 220 },
  eventPickerList: { gap: spacing.x1 },
  eventPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.x2,
    paddingVertical: spacing.x3,
    paddingHorizontal: spacing.x2,
  },
  eventPickerRowText: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '700' },
  recorderCard: {
    gap: spacing.x5,
    padding: spacing.x6,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  recordingLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
  },
  recordingMissing: { color: colors.muted, fontSize: 13, lineHeight: 20, flex: 1 },
  notesToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  notesToggleCopy: { flex: 1, gap: 2 },
  tabRow: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  tabButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium - 2,
  },
  tabButtonActive: { backgroundColor: colors.surface },
  tabButtonText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  tabButtonTextActive: { color: colors.ink, fontWeight: '800' },
  tabPane: { gap: spacing.x3 },
  section: { gap: spacing.x3 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  shareToggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  linkCopy: { flex: 1, gap: 3 },
  linkHint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  fieldGroup: { gap: spacing.x3 },
  detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  guestShareLabel: { marginTop: spacing.x4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  helperCopy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  approveHint: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  uploadFailed: { gap: spacing.x2 },
  uploadFailedText: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  secondaryActionsRow: { flexDirection: 'row', gap: spacing.x2 },
  secondaryActionsRowItem: { flex: 1 },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15,
  },
  notesField: { height: 140, maxHeight: 140, paddingTop: spacing.x3, textAlignVertical: 'top' },
  privateNotesField: { height: 110, maxHeight: 110, paddingTop: spacing.x3, textAlignVertical: 'top' },
  summaryCopy: { color: colors.ink, fontSize: 15, lineHeight: 22, flex: 1 },
  actionList: { gap: spacing.x2 },
  actionItem: { overflow: 'hidden', borderRadius: radius.medium, backgroundColor: colors.canvas },
  actionRow: { minHeight: 54, padding: spacing.x3, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, borderRadius: radius.medium, backgroundColor: colors.canvas },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  actionTitleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  actionComposerToggle: {
    minHeight: 46,
    paddingHorizontal: spacing.x4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.x3,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  actionComposerToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  actionComposerToggleText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  choiceChip: { paddingHorizontal: spacing.x3, paddingVertical: spacing.x2, borderRadius: radius.round, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  choiceChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceChipText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  choiceChipTextActive: { color: colors.white },
});

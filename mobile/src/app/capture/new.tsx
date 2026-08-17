import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CaretDown, CaretUp, CloudArrowUp, DeviceMobile, PaperPlaneTilt, PencilSimple, Plus, Trash } from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { CaptureContextStep } from '@/components/capture-context-step';
import { CaptureErrorSheet } from '@/components/capture-error-sheet';
import { CaptureInteractionStep } from '@/components/capture-interaction-step';
import { FollowUpDuePicker } from '@/components/follow-up-due-picker';
import { CaptureStepIndicator } from '@/components/capture-step-indicator';
import { OfflineBanner } from '@/components/offline-banner';
import { resolveCachedEventSnapshot, type EventSnapshot } from '@/features/events/event-cache';
import { Body, Button, FooterBackButton, PageHeader } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import {
  createFreshCaptureDraft,
  captureDraftFromRemote,
  captureDraftToRemote,
  deleteCaptureDraft,
  EMPTY_CAPTURE_DRAFT,
  hasCaptureDraftProgress,
  getCaptureDeviceIdentity,
  readCaptureDraft,
  setAuthReturnPath,
  writeCaptureDraft,
  type CaptureWizardDraft,
  type ManualFollowUpDraft,
} from '@/features/encounters/capture-draft';
import {
  applyExtractionDraft,
} from '@/features/encounters/extraction-helpers';
import {
  fetchAllConnectionsMerged,
  type ConnectionItem,
} from '@/features/connections/connections-api';
import {
  createGatherPerson,
  formatPeopleNames,
  hasValidGatherPeople,
  personFromConnection,
  personFromExchange,
  syncLegacyPersonFields,
  MAX_GATHER_PEOPLE,
} from '@/features/encounters/gather-people';
import {
  removeExpiredLocalRecordings,
  readLocalRecordingMetadata,
  saveLocalRecording,
} from '@/features/encounters/local-recordings';
import {
  buildEncounterPayload,
  CaptureSessionConflictError,
  extractEncounterDraft,
  fetchInboundExchanges,
  fetchCaptureSessions,
  fetchPublicCardName,
  saveEncounter,
  syncCaptureSession,
  transcribeEncounterAudio,
  uploadEncounterRecordingToDrive,
  uploadEncounterRecordingToOneDrive,
  type EncounterExtractionCommitment,
  type InboundExchange,
} from '@/features/encounters/encounter-api';
import { fetchEncounterRecords } from '@/features/follow-ups/follow-up-api';
import {
  readRecordingStorageDestination,
  recordingStorageDestinationLabel,
  type RecordingStorageDestination,
} from '@/lib/recording-storage-preference';
import {
  displayFollowUpTitle,
  FOLLOW_UP_CHANNELS,
  SELECTABLE_FOLLOW_UP_CHANNELS,
  type FollowUpChannel,
} from '@/features/follow-ups/follow-up-channels';
import { formatDueLabel } from '@/lib/due-date';
import { stitchRecordingSegments } from '@/lib/audio-segment-stitch';
import { isOnline } from '@/lib/connectivity';
import { describeError } from '@/lib/friendly-error';
import { useSharedCaptureRecorder, type ImportRecordingMeta } from '@/features/encounters/capture-recorder-context';
import { normalizeTranscriptForExtraction } from '@/lib/transcript-cleanup';
import { notifyMeetingReviewReady } from '@/features/notifications/notification-service';
import { useAppInsets } from '@/lib/safe-area';
import { readEnv } from '@/lib/env';
import { colors, radius, spacing } from '@/theme/tokens';

type GenerationStatus = 'idle' | 'generating' | 'error';
type CommitmentAssignment = { owner: 'me' | 'guest'; targetName: string };

const CAPTURE_DRAFT_READ_TIMEOUT_MS = 2_000;

async function readCaptureDraftWithoutBlocking(encounterId?: string): Promise<CaptureWizardDraft | null> {
  return Promise.race([
    readCaptureDraft(encounterId),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), CAPTURE_DRAFT_READ_TIMEOUT_MS);
    }),
  ]);
}

function commitmentKey(commitment: EncounterExtractionCommitment, index: number): string {
  return `${index}:${commitment.title}:${commitment.channel}:${commitment.dueAt}`;
}

function defaultCommitmentKeys(commitments: EncounterExtractionCommitment[]): string[] {
  return commitments.flatMap((commitment, index) => commitment.title.trim() ? [commitmentKey(commitment, index)] : []);
}

function initialCommitmentAssignments(
  commitments: EncounterExtractionCommitment[],
  people: { name: string }[],
): Record<string, CommitmentAssignment> {
  return Object.fromEntries(commitments.map((commitment, index) => {
    const matched = people.find((person) => (
      person.name.trim().toLocaleLowerCase() === commitment.ownerName.trim().toLocaleLowerCase()
    ));
    return [commitmentKey(commitment, index), {
      owner: commitment.owner,
      targetName: (commitment.owner === 'guest' ? matched?.name : people[0]?.name) || commitment.ownerName,
    }];
  }));
}

export default function CaptureWizardScreen() {
  const params = useLocalSearchParams<{
    exchange?: string;
    slug?: string;
    draftId?: string;
    personName?: string;
    personEmail?: string;
    sourceId?: string;
    contactId?: string;
    openConsent?: string;
    autoFinish?: string;
  }>();
  const { session } = useAuth();
  const insets = useAppInsets();
  const [draft, setDraft] = useState<CaptureWizardDraft>(EMPTY_CAPTURE_DRAFT);
  const [eventContext, setEventContext] = useState<EventSnapshot | undefined>();
  const captureDeviceRef = useRef<{ id: string; label: string } | null>(null);
  const remoteSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedDraftAtRef = useRef('');
  const suppressNextRemoteSyncRef = useRef(false);
  const [exchanges, setExchanges] = useState<InboundExchange[]>([]);
  const [uncertainFields, setUncertainFields] = useState<string[]>([]);
  const [commitmentSuggestions, setCommitmentSuggestions] = useState<EncounterExtractionCommitment[]>([]);
  const [selectedCommitmentKeys, setSelectedCommitmentKeys] = useState<string[]>([]);
  const [commitmentAssignments, setCommitmentAssignments] = useState<Record<string, CommitmentAssignment>>({});
  const [extracting, setExtracting] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
  const [generationError, setGenerationError] = useState('');
  const [loadingExchanges, setLoadingExchanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorSheetOpen, setErrorSheetOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [syncConflict, setSyncConflict] = useState(false);
  const requestRef = useRef(0);
  const generationKickoffRef = useRef('');
  const generationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftWriteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedErrorRef = useRef('');
  const hydratedRef = useRef(false);
  const autoFinishRef = useRef(false);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [priorMeetingCounts, setPriorMeetingCounts] = useState<Record<string, number>>({});
  const [draftReady, setDraftReady] = useState(false);
  const [interactionPathStarted, setInteractionPathStarted] = useState(false);

  useEffect(() => {
    void resolveCachedEventSnapshot().then(setEventContext);
  }, []);
  const [manualFollowUpSheetOpen, setManualFollowUpSheetOpen] = useState(false);
  const [editingManualFollowUpId, setEditingManualFollowUpId] = useState('');
  const [newFollowUpTitle, setNewFollowUpTitle] = useState('');
  const [newFollowUpChannel, setNewFollowUpChannel] = useState<FollowUpChannel>('email');
  const [newFollowUpOwner, setNewFollowUpOwner] = useState<'me' | 'guest'>('me');
  const [newFollowUpTargetPersonId, setNewFollowUpTargetPersonId] = useState('');
  const [newFollowUpDueAt, setNewFollowUpDueAt] = useState('');
  const [newFollowUpDetailOpen, setNewFollowUpDetailOpen] = useState(false);
  const [manualFollowUpDetailOpen, setManualFollowUpDetailOpen] = useState<Record<string, boolean>>({});
  const [privateNotesSheetOpen, setPrivateNotesSheetOpen] = useState(false);
  const [recordingStorageDestination, setRecordingStorageDestination] = useState<RecordingStorageDestination>('local_only');
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const hasStartedInteraction = interactionPathStarted
    || (draftReady && draft.step === 0 && (
      draft.captureMode === 'quick_context'
      || draft.consent
      || draft.people.length > 0
      || Boolean(draft.recordingUri)
      || Boolean(draft.transcript.trim())
    ));
  const updateDraft = useCallback((changes: Partial<CaptureWizardDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...changes };
      const unchanged = (Object.keys(changes) as (keyof CaptureWizardDraft)[]).every(
        (key) => Object.is(current[key], next[key]),
      );
      return unchanged ? current : { ...next, updatedAt: new Date().toISOString() };
    });
  }, []);

  function addManualFollowUp() {
    updateDraft({
      manualFollowUps: [...draft.manualFollowUps, {
        id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: newFollowUpTitle.trim(),
        channel: newFollowUpChannel,
        owner: newFollowUpOwner,
        targetPersonId: newFollowUpTargetPersonId,
        dueAt: newFollowUpDueAt,
      }],
    });
    setNewFollowUpTitle('');
    setNewFollowUpChannel('email');
    setNewFollowUpOwner('me');
    setNewFollowUpTargetPersonId('');
    setNewFollowUpDueAt('');
    setNewFollowUpDetailOpen(false);
    setManualFollowUpSheetOpen(false);
  }

  function updateManualFollowUp(id: string, patch: Partial<ManualFollowUpDraft>) {
    updateDraft({
      manualFollowUps: draft.manualFollowUps.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  function removeManualFollowUp(id: string) {
    updateDraft({ manualFollowUps: draft.manualFollowUps.filter((item) => item.id !== id) });
    if (editingManualFollowUpId === id) setEditingManualFollowUpId('');
  }

  const getPriorMeetingCount = useCallback((email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return 0;
    return priorMeetingCounts[normalized] ?? 0;
  }, [priorMeetingCounts]);

  const reloadLatestRemoteCapture = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const current = draftRef.current;
      const sessions = await fetchCaptureSessions(session.access_token);
      const match = sessions.find((item) => item.encounterId === current.encounterId);
      if (!match) {
        setMessage('The latest capture could not be loaded. Your local recording remains safe on this device.');
        return;
      }
      const remote = captureDraftFromRemote(match);
      const merged: CaptureWizardDraft = {
        ...remote,
        recordingUri: current.recordingUri,
        recordingSource: current.recordingSource,
        importFileName: current.importFileName,
        importMimeType: current.importMimeType,
        hasLocalAudio: Boolean(current.recordingUri) || remote.hasLocalAudio,
      };
      suppressNextRemoteSyncRef.current = true;
      lastSyncedDraftAtRef.current = remote.updatedAt;
      setDraft(merged);
      setSyncConflict(false);
      setMessage('Loaded the latest capture. Audio stored on this device is still available.');
    } catch {
      setMessage('The latest capture could not be loaded. Check your connection and try again; your local recording remains safe.');
    }
  }, [session?.access_token]);

  function resolveContactIdForDraft(current: CaptureWizardDraft) {
    const email = current.personEmail.trim().toLowerCase();
    const exchangeId = current.exchangeId?.trim();
    const match = connections.find((connection) => (
      (email && connection.email?.trim().toLowerCase() === email)
      || (exchangeId && connection.source === 'inbound' && connection.sourceId === exchangeId)
    ));
    if (match?.source === 'contact') return match.sourceId;
    return current.contactId || '';
  }

  const handleTranscriptChange = useCallback((transcript: string) => {
    updateDraft({ transcript });
  }, [updateDraft]);

  const handleDurationChange = useCallback((durationSeconds: number) => {
    updateDraft({ durationSeconds });
  }, [updateDraft]);

  const handleRecordingUriChange = useCallback((
    recordingUri: string,
    recordingSource: 'recorded' | 'imported',
    meta?: ImportRecordingMeta,
  ) => {
    updateDraft({
      recordingUri,
      recordingSource,
      importFileName: meta?.fileName || '',
      importMimeType: meta?.mimeType || '',
    });
  }, [updateDraft]);

  const showCaptureError = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (dismissedErrorRef.current === trimmed) return;
    setError(trimmed);
    setErrorSheetOpen(true);
  }, []);

  const closeErrorSheet = useCallback(() => {
    if (error.trim()) {
      dismissedErrorRef.current = error.trim();
    }
    setErrorSheetOpen(false);
    setError('');
  }, [error]);

  const handleImportStarted = useCallback(() => {
    dismissedErrorRef.current = '';
    setError('');
    setErrorSheetOpen(false);
  }, []);

  const handleRecorderError = useCallback((recorderError: string) => {
    if (!recorderError.trim()) {
      setError('');
      return;
    }
    showCaptureError(recorderError);
  }, [showCaptureError]);

  const generateMeetingContext = useCallback(async (transcript: string, requestId?: number) => {
    const clean = normalizeTranscriptForExtraction(transcript.trim());
    if (!clean) {
      setUncertainFields([]);
      setGenerationStatus('idle');
      return;
    }

    if (!session?.access_token) {
      setGenerationStatus('error');
      const signInMessage = 'Sign in to generate meeting context from your transcript.';
      setGenerationError(signInMessage);
      showCaptureError(signInMessage);
      return;
    }

    const activeRequest = requestId ?? requestRef.current + 1;
    if (!requestId) requestRef.current = activeRequest;
    setExtracting(true);
    setGenerationStatus('generating');
    setGenerationError('');
    setError('');

    const hints = draftRef.current;

    try {
      const result = await extractEncounterDraft(session.access_token, clean, {
        personName: formatPeopleNames(hints.people) || hints.personName,
        personEmail: hints.personEmail,
        personPhone: hints.personPhone,
        people: (hints.people ?? []).map((person) => ({
          name: person.name,
          email: person.email,
          phone: person.phone,
        })),
      });
      if (activeRequest !== requestRef.current) return;

      const commitments = result.draft?.commitments ?? [];
      setCommitmentSuggestions(commitments);
      setSelectedCommitmentKeys(defaultCommitmentKeys(commitments));
      setCommitmentAssignments(initialCommitmentAssignments(commitments, hints.people));

      setDraft((current) => {
        const extracted = applyExtractionDraft(
          { ...current, followUp: '', followUpType: 'email' },
          result.draft!,
          { replace: true },
        );
        const shouldSeedFollowUp = current.manualFollowUps.length === 0
          && commitments.length === 0
          && Boolean(result.draft?.followUp?.trim());
        return {
          ...current,
          title: extracted.title,
          sharedSummary: extracted.sharedSummary,
          privateNotes: extracted.privateNotes,
          manualFollowUps: shouldSeedFollowUp
            ? [{
                id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                title: result.draft!.followUp,
                channel: result.draft!.followUpType,
                owner: 'me' as const,
                targetPersonId: '',
                dueAt: '',
              }]
            : current.manualFollowUps,
        };
      });
      setUncertainFields(result.uncertainFields ?? []);
      setGenerationStatus('idle');
      void notifyMeetingReviewReady({
        encounterId: hints.encounterId,
        title: result.draft?.title || hints.title,
      });
    } catch (caught) {
      if (activeRequest !== requestRef.current) return;
      const message = describeError(caught, 'Could not generate meeting context right now.');
      setGenerationStatus('error');
      setGenerationError(message);
      showCaptureError(message);
      // AI summarization genuinely failed (network/API error) — fall back to
      // the raw transcript rather than leaving the summary blank, but only
      // as a last resort here, not as the default path for short transcripts.
      setDraft((current) => current.sharedSummary.trim() ? current : { ...current, sharedSummary: clean });
    } finally {
      if (activeRequest === requestRef.current) setExtracting(false);
    }
  }, [session?.access_token, showCaptureError]);

  const handleTranscriptFinalized = useCallback((transcriptValue: string) => {
    const clean = normalizeTranscriptForExtraction(transcriptValue.trim());
    if (!clean) return;
    // Any real transcript content — even a short one — goes through actual
    // AI summarization rather than a raw-text passthrough, so the share
    // summary reads like a real summary instead of a transcript dump.
    // generateMeetingContext only falls back to the raw transcript itself
    // if that call genuinely fails.
    if (draftRef.current.step >= 1 && generationStatus !== 'generating') {
      generationKickoffRef.current = '';
      void generateMeetingContext(clean);
    }
  }, [generateMeetingContext, generationStatus]);

  const transcribeFromServer = useCallback(async (uri: string, meta?: ImportRecordingMeta) => {
    if (!session?.access_token) {
      throw new Error('Sign in to auto-transcribe this recording, or paste what was said.');
    }
    const fileName = meta?.fileName || draftRef.current.importFileName || undefined;
    const mimeType = meta?.mimeType || draftRef.current.importMimeType || undefined;
    const result = await transcribeEncounterAudio(session.access_token, uri, { fileName, mimeType });
    if (result.transcript) return result.transcript;
    throw new Error('Could not transcribe this recording. Paste or type what was said.');
  }, [session?.access_token]);

  const goToStep = useCallback((step: number) => {
    updateDraft({ step: Math.max(0, Math.min(2, step)) });
  }, [updateDraft]);

  const handleImportReady = useCallback(() => {
    if (!draftRef.current.gatherSessionStartedAt) {
      updateDraft({ gatherSessionStartedAt: new Date().toISOString() });
    }
  }, [updateDraft]);

  const recorder = useSharedCaptureRecorder({
    transcript: draft.transcript,
    onTranscriptChange: handleTranscriptChange,
    onDurationChange: handleDurationChange,
    onRecordingUriChange: handleRecordingUriChange,
    onError: handleRecorderError,
    onImportReady: handleImportReady,
    onImportStarted: handleImportStarted,
    onTranscriptFinalized: handleTranscriptFinalized,
    transcribeFromServer,
  }, draft.encounterId);

  const recorderHydratedRef = useRef(false);
  const isTranscribing = recorder.transcriptStatus === 'transcribing'
    || recorder.serverTranscribePhase === 'preparing'
    || recorder.serverTranscribePhase === 'transcribing'
    || recorder.serverTranscribePhase === 'revealing'
    || recorder.isFinishing;

  useEffect(() => {
    if (!draftReady) return;

    const now = new Date().toISOString();
    if (recorder.recordingState === 'recording') {
      updateDraft({
        sessionStatus: 'recording',
        failureReason: '',
        recordingStartedAt: draftRef.current.recordingStartedAt || now,
        recordingStoppedAt: '',
      });
      return;
    }
    if (recorder.recordingState === 'paused') {
      updateDraft({ sessionStatus: 'paused' });
      return;
    }
    if (isTranscribing) {
      updateDraft({ sessionStatus: 'processing' });
      return;
    }
    if (recorder.recordingUri || draftRef.current.recordingUri) {
      updateDraft({
        sessionStatus: 'review_ready',
        recordingStoppedAt: draftRef.current.recordingStoppedAt || now,
      });
    }
  }, [draftReady, isTranscribing, recorder.recordingState, recorder.recordingUri, updateDraft]);

  // serverTranscribePhase/serverTranscribeError are hook-local React state
  // only — without this, a killed-and-reopened app has no memory that a
  // recording's transcription needs retrying.
  useEffect(() => {
    if (!draftReady) return;
    if (recorder.serverTranscribePhase === 'failed') {
      // Persisting hook-local transcription state to the draft's external
      // storage — a legitimate effect, not derivable-during-render state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      updateDraft({
        transcriptPending: true,
        transcriptPendingError: recorder.serverTranscribeError || 'Could not transcribe this recording.',
      });
    } else if (recorder.serverTranscribePhase === 'done') {
      updateDraft({ transcriptPending: false, transcriptPendingError: '' });
    }
  }, [draftReady, recorder.serverTranscribePhase, recorder.serverTranscribeError, updateDraft]);

  const sessionExchanges = useMemo(() => {
    const started = draft.gatherSessionStartedAt;
    if (!started) return [];
    const startedMs = Date.parse(started) - 5000;
    return exchanges.filter((exchange) => {
      if (!exchange.created_at) return false;
      return Date.parse(exchange.created_at) >= startedMs;
    });
  }, [draft.gatherSessionStartedAt, exchanges]);

  const captureHasProgress = hasCaptureDraftProgress(draft)
    || recorder.recordingState === 'recording'
    || recorder.recordingState === 'paused';
  const activeRecording = recorder.recordingState === 'recording'
    || recorder.recordingState === 'paused';

  const leaveNow = useCallback(async (stopFirst: boolean) => {
    if (stopFirst) {
      try {
        await recorder.stopRecording();
      } catch {
        // Best-effort: still safe to leave — the native service keeps the
        // audio file either way, and the draft is saved locally below.
      }
    }
    if (captureHasProgress) {
      const current = draftRef.current;
      const next = {
        ...current,
        recordingUri: current.recordingUri || recorder.recordingUri,
        recordingSource: current.recordingSource || recorder.recordingSource || current.recordingSource,
        transcript: current.transcript || recorder.displayTranscript.trim(),
        durationSeconds: current.durationSeconds || recorder.seconds,
      };
      setDraft(next);
      void writeCaptureDraft(next);
    }
    if (router.canGoBack()) router.back();
    else router.replace('/capture');
  }, [captureHasProgress, recorder]);

  // Recording keeps going in the background once you navigate away — the
  // persistent notification (Android) and the floating ActiveCaptureBanner
  // (both platforms) already track it and let you stop from anywhere or
  // come back here later. Leaving this screen must not stop the recording
  // or ask for confirmation; that would defeat the point of having that
  // background-recording infrastructure at all.
  const requestLeave = useCallback(() => {
    void leaveNow(false);
  }, [leaveNow]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        requestLeave();
        return true;
      });
      return () => subscription.remove();
    }, [requestLeave]),
  );

  useEffect(() => {
    void readRecordingStorageDestination().then(setRecordingStorageDestination);
  }, []);

  useEffect(() => {
    if (!draftReady || draft.step < 1) return;
    const clean = draft.transcript.trim();
    if (clean.length < 20) return;
    if (generationStatus === 'generating') return;

    const kickoffKey = `${draft.encounterId}:${clean.length}:${clean.slice(-80)}`;
    if (generationKickoffRef.current === kickoffKey) return;

    if (generationDebounceRef.current) {
      clearTimeout(generationDebounceRef.current);
    }

    generationDebounceRef.current = setTimeout(() => {
      generationKickoffRef.current = kickoffKey;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      void generateMeetingContext(clean, requestId);
    }, 900);

    return () => {
      if (generationDebounceRef.current) {
        clearTimeout(generationDebounceRef.current);
      }
    };
  }, [draft.encounterId, draft.step, draft.transcript, draftReady, generateMeetingContext, generationStatus]);

  useEffect(() => {
    void removeExpiredLocalRecordings();
  }, []);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void (async () => {
      try {
        // A specific draftId means a draft was just written by the caller
        // (e.g. beginFreshCapture) moments before navigating here — it must
        // exist. Racing that read against a timeout and silently minting a
        // fresh encounterId on a loss orphaned the real draft and created a
        // second, duplicate "in progress" entry. Only the callerless
        // fallback path (no draftId — recovering "whatever was last open")
        // is safe to give up on after a timeout.
        const stored = params.draftId
          ? await readCaptureDraft(String(params.draftId))
          : await readCaptureDraftWithoutBlocking();
        let remote: CaptureWizardDraft | null = null;
        if (!stored && params.draftId && session?.access_token) {
          const sessions = await fetchCaptureSessions(session.access_token).catch(() => []);
          const match = sessions.find((item) => item.encounterId === String(params.draftId));
          if (match) {
            remote = captureDraftFromRemote(match);
            lastSyncedDraftAtRef.current = remote.updatedAt;
          }
        }
        const next = { ...(stored ?? remote ?? createFreshCaptureDraft()) };
        if (params.exchange) next.exchangeId = String(params.exchange);
        if (!(next.people ?? []).length && params.personName?.trim()) {
          next.people = [createGatherPerson({
            id: params.sourceId ? String(params.sourceId) : undefined,
            name: String(params.personName).trim(),
            email: params.personEmail ? String(params.personEmail).trim() : '',
            exchangeId: params.exchange ? String(params.exchange) : undefined,
          })];
          Object.assign(next, syncLegacyPersonFields(next.people));
          next.contactId = params.contactId ? String(params.contactId) : next.contactId;
        }
        if (params.slug && readEnv()) {
          const name = await fetchPublicCardName(readEnv()!.publicCardBaseUrl, String(params.slug));
          if (name && !(next.people ?? []).length) {
            next.people = [createGatherPerson({ name })];
            Object.assign(next, syncLegacyPersonFields(next.people));
          }
        }
        setDraft(next);
        if (!stored) void writeCaptureDraft(next);
      } finally {
        setDraftReady(true);
      }
    })();
  }, [params.contactId, params.draftId, params.exchange, params.personEmail, params.personName, params.slug, params.sourceId, session?.access_token]);

  useEffect(() => {
    if (!draftReady) return;
    if (draftWriteDebounceRef.current) {
      clearTimeout(draftWriteDebounceRef.current);
    }
    draftWriteDebounceRef.current = setTimeout(() => {
      void writeCaptureDraft(draft);
    }, 450);
    return () => {
      if (draftWriteDebounceRef.current) {
        clearTimeout(draftWriteDebounceRef.current);
      }
    };
  }, [draft, draftReady]);

  useEffect(() => {
    if (!draftReady || !session?.access_token || !hasCaptureDraftProgress(draft)) return;
    if (suppressNextRemoteSyncRef.current) {
      suppressNextRemoteSyncRef.current = false;
      return;
    }
    if (remoteSyncDebounceRef.current) clearTimeout(remoteSyncDebounceRef.current);
    remoteSyncDebounceRef.current = setTimeout(() => {
      void (async () => {
        const device = captureDeviceRef.current ?? await getCaptureDeviceIdentity();
        captureDeviceRef.current = device;
        const syncingDraft = draftRef.current;
        await syncCaptureSession(session.access_token, captureDraftToRemote(syncingDraft, device));
        lastSyncedDraftAtRef.current = syncingDraft.updatedAt;
        setSyncConflict(false);
      })().catch((syncError: unknown) => {
        if (syncError instanceof CaptureSessionConflictError) {
          setSyncConflict(true);
          setMessage('This capture moved forward on another device. Return to Capture and reopen it to load the latest version. Your local recording remains safe on this device.');
          return;
        }
        // Local draft remains authoritative while offline; the next edit retries sync.
      });
    }, 1200);
    return () => {
      if (remoteSyncDebounceRef.current) clearTimeout(remoteSyncDebounceRef.current);
    };
  }, [draft, draftReady, session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      if (!draftReady || !session?.access_token || !hasCaptureDraftProgress(draftRef.current)) return undefined;
      let cancelled = false;

      const refreshRemoteDraft = async () => {
        const current = draftRef.current;
        if (current.sessionStatus === 'recording' || current.sessionStatus === 'paused' || current.sessionStatus === 'processing') return;
        const device = captureDeviceRef.current ?? await getCaptureDeviceIdentity();
        captureDeviceRef.current = device;
        const sessions = await fetchCaptureSessions(session.access_token).catch(() => []);
        if (cancelled) return;
        const match = sessions.find((item) => item.encounterId === current.encounterId);
        if (!match || match.deviceId === device.id) return;
        if (Date.parse(match.updatedAt) <= Date.parse(current.updatedAt)) return;

        if (lastSyncedDraftAtRef.current && current.updatedAt !== lastSyncedDraftAtRef.current) {
          setMessage(`Newer changes are available from ${match.deviceLabel || 'another device'}. Finish or leave this field before reopening the draft to avoid replacing your local edits.`);
          return;
        }

        const remote = captureDraftFromRemote(match);
        const merged: CaptureWizardDraft = {
          ...remote,
          recordingUri: current.recordingUri,
          recordingSource: current.recordingSource,
          importFileName: current.importFileName,
          importMimeType: current.importMimeType,
          hasLocalAudio: Boolean(current.recordingUri) || remote.hasLocalAudio,
        };
        suppressNextRemoteSyncRef.current = true;
        lastSyncedDraftAtRef.current = remote.updatedAt;
        setDraft(merged);
        setSyncConflict(false);
        setMessage(match.sessionStatus === 'failed' && match.failureReason === 'recording_heartbeat_lost'
          ? `The recording on ${match.deviceLabel || 'another device'} was interrupted. Everything already captured is safe; review the draft here.`
          : `Updated with the latest context from ${match.deviceLabel || 'another device'}. Audio stays on the device that recorded it.`);
      };

      void refreshRemoteDraft();
      const timer = setInterval(() => { void refreshRemoteDraft(); }, 15000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [draftReady, session?.access_token]),
  );

  useEffect(() => {
    if (!draftReady || recorderHydratedRef.current) return;
    recorderHydratedRef.current = true;

    void getCaptureDeviceIdentity().then((device) => { captureDeviceRef.current = device; });
    if (
      (draft.sessionStatus === 'recording' || draft.sessionStatus === 'paused')
      && recorder.recordingState !== 'recording'
      && recorder.recordingState !== 'paused'
      && !draft.recordingUri
      && (!draft.originDeviceId || draft.originDeviceId === captureDeviceRef.current?.id)
    ) {
      updateDraft({
        sessionStatus: 'failed',
        failureReason: 'recording_interrupted',
        recordingStoppedAt: new Date().toISOString(),
      });
      showCaptureError('The previous recording was interrupted before it could be saved. Your draft is safe; start a new recording to continue.');
    }

    if (draft.sessionStatus === 'failed' && draft.failureReason === 'recording_heartbeat_lost') {
      void Promise.resolve().then(() => {
        setMessage('The live recording was interrupted. Everything already captured is safe; review this draft and record again only if you need more audio.');
      });
    }

    if (draft.originDeviceId && draft.originDeviceId !== captureDeviceRef.current?.id && !draft.recordingUri) {
      showCaptureError(`The audio remains on ${draft.originDeviceLabel || 'the device that started this capture'}. You can continue the people, transcript, context, and follow-up here.`);
    }

    recorder.hydrateFromDraft({
      recordingUri: draft.recordingUri,
      recordingSource: draft.recordingSource,
      transcript: draft.transcript,
      durationSeconds: draft.durationSeconds,
      recordingSegments: draft.recordingSegments,
    });

    if (draft.recordingUri && draft.transcript.trim().length < 20 && session?.access_token) {
      void recorder.transcribeRecordingIfNeeded(draft.recordingUri);
    }
  }, [draft.durationSeconds, draft.failureReason, draft.originDeviceId, draft.originDeviceLabel, draft.recordingSegments, draft.recordingSource, draft.recordingUri, draft.sessionStatus, draft.transcript, draftReady, recorder, session?.access_token, showCaptureError, updateDraft]);

  useEffect(() => {
    if (!draftReady) return;
    const uri = draft.recordingUri || recorder.recordingUri;
    if (!uri || recorder.recordingState === 'recording') return;

    void saveLocalRecording(draft.encounterId, uri, {
      durationSeconds: draft.durationSeconds || recorder.seconds,
      source: draft.recordingSource || recorder.recordingSource || 'recorded',
      retention: draft.retention,
    }).catch(() => {
      // local persistence is best-effort during capture
    });
  }, [
    draft.durationSeconds,
    draft.encounterId,
    draft.recordingSource,
    draft.recordingUri,
    draft.retention,
    draftReady,
    recorder.recordingSource,
    recorder.recordingState,
    recorder.recordingUri,
    recorder.seconds,
  ]);

  useEffect(() => {
    if (!session?.access_token || draft.step !== 0) return;

    let cancelled = false;
    const loadExchanges = (showLoading = false) => {
      if (showLoading) setLoadingExchanges(true);
      void fetchInboundExchanges(session.access_token!)
        .then((items) => {
          if (!cancelled) setExchanges(items);
        })
        .catch(() => {
          if (!cancelled) setExchanges([]);
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoadingExchanges(false);
        });
    };

    loadExchanges(true);
    const timer = setInterval(() => loadExchanges(false), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [draft.step, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      void Promise.resolve().then(() => {
        setConnections([]);
        setPriorMeetingCounts({});
      });
      return;
    }

    let cancelled = false;
    void Promise.all([
      fetchAllConnectionsMerged(session.access_token),
      fetchEncounterRecords(session.access_token),
    ])
      .then(([nextConnections, encounters]) => {
        if (cancelled) return;
        setConnections(nextConnections);
        const counts: Record<string, number> = {};
        for (const encounter of encounters) {
          const email = encounter.personEmail.trim().toLowerCase();
          if (!email) continue;
          counts[email] = (counts[email] ?? 0) + 1;
        }
        setPriorMeetingCounts(counts);
      })
      .catch(() => {
        if (!cancelled) {
          setConnections([]);
          setPriorMeetingCounts({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!params.exchange || !exchanges.length) return;
    const match = exchanges.find((item) => item.id === params.exchange);
    if (match) linkExchange(match);
  }, [exchanges, params.exchange]);

  function linkExchange(exchange: InboundExchange) {
    setDraft((current) => {
      const people = current.people ?? [];
      if (people.some((person) => person.exchangeId === exchange.id)) return current;
      if (people.length >= MAX_GATHER_PEOPLE) return current;
      return {
        ...current,
        ...syncLegacyPersonFields([...people, personFromExchange(exchange)]),
      };
    });
  }

  function linkConnection(connection: ConnectionItem) {
    setDraft((current) => {
      const people = current.people ?? [];
      const email = connection.email?.trim().toLowerCase();
      if (email && people.some((person) => person.email.trim().toLowerCase() === email)) return current;
      if (people.length >= MAX_GATHER_PEOPLE) return current;
      return {
        ...current,
        ...syncLegacyPersonFields([...people, personFromConnection(connection)]),
      };
    });
  }

  async function continueFromInteraction(skipRecording = false) {
    if (draft.captureMode === 'recording' && !draft.consent) {
      showCaptureError('Confirm that everyone agreed before continuing.');
      return;
    }
    // Stop the recorder before gating on people, not after. Recording must
    // actually stop the moment the user asks to finish, regardless of
    // whether the people list is valid yet — otherwise the mic keeps
    // running in the background while they add someone, activeRecording
    // stays true, and the "Recording in progress" leave-guard keeps firing
    // even though the user already asked to stop and is just filling in
    // the pending-review step.
    if (draft.captureMode === 'recording' && !skipRecording && (recorder.recordingState === 'recording' || recorder.recordingState === 'paused')) {
      await recorder.stopRecording();
    } else if (draft.captureMode !== 'recording') {
      await recorder.awaitPendingFinish();
    }
    const people = draft.people ?? [];
    if (!hasValidGatherPeople(people)) {
      showCaptureError('Add at least one person you met.');
      return;
    }
    updateDraft({ step: draft.captureMode === 'recording' ? 2 : 1 });
  }

  // Stopping from the floating banner (or the capture list's active-capture
  // card) navigates here with autoFinish=1 instead of calling
  // recorder.stopRecording directly — this makes "stop from anywhere" run
  // the exact same validate-then-advance path as tapping "End recording" in
  // the wizard, so the user lands in review instead of a stranded step-0
  // draft. If people haven't been gathered yet, continueFromInteraction
  // already surfaces "Add at least one person you met" and leaves the
  // wizard on this step, which is exactly where they can add one.
  useEffect(() => {
    if (!draftReady || autoFinishRef.current) return;
    if (params.autoFinish !== '1') return;
    autoFinishRef.current = true;
    // continueFromInteraction can call setState synchronously in its first
    // branch (showCaptureError) before its first await — deferring outside
    // this effect's commit phase avoids the cascading-render lint error and
    // matches React's guidance for effects that trigger state updates.
    const timer = setTimeout(() => {
      void continueFromInteraction();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, params.autoFinish]);

  function continueFromContext() {
    if (!draft.title.trim() && !draft.sharedSummary.trim()) {
      dismissedErrorRef.current = '';
      showCaptureError('Add a meeting title or share summary.');
      return;
    }
    updateDraft({ step: 2 });
  }

  const contextNextDisabled =
    isTranscribing
    || (generationStatus === 'generating' && !draft.title.trim() && !draft.sharedSummary.trim());

  const contextNextLoading =
    generationStatus === 'generating' && !draft.title.trim() && !draft.sharedSummary.trim();

  async function ensureAuth(): Promise<string | null> {
    if (session?.access_token) return session.access_token;
    await writeCaptureDraft(draft);
    await setAuthReturnPath('/capture/new');
    router.push('/auth');
    return null;
  }

  async function saveAndReview() {
    const token = await ensureAuth();
    if (!token) return;

    const recordingUriForGuard = draft.recordingUri || recorder.recordingUri;
    if (recordingUriForGuard && draft.transcript.trim().length < 20 && isOnline()) {
      setSaving(true);
      let retried = '';
      try {
        retried = (await recorder.retryTranscription())?.trim() || '';
      } finally {
        setSaving(false);
      }
      if (retried.length < 20) {
        showCaptureError('This recording has no transcript yet. Try transcribing again before saving, or continue without one.');
        return;
      }
      updateDraft({ transcript: retried });
    }

    if (!isOnline()) {
      // The draft is already saved continuously as it's edited — the only
      // thing this step needs a network for is the server-side commit.
      // Skip it and send the user back to the list, where this draft
      // already shows as ready to review; they can retry once back online.
      router.replace('/capture');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      let recording = await readLocalRecordingMetadata(draft.encounterId);
      let recordingUri = draft.recordingUri || recorder.recordingUri;
      // An interruption (or a deliberate resume) can leave prior takes
      // archived as separate files — combine them into one before this
      // capture is saved, so upload/playback never has to know it happened.
      const priorSegments = draft.recordingSegments.length ? draft.recordingSegments : recorder.recordingSegments;
      if (recordingUri && priorSegments.length) {
        recordingUri = await stitchRecordingSegments(priorSegments, recordingUri);
      }
      const recordingDestination = recordingUri ? await readRecordingStorageDestination() : 'local_only';
      if (recordingUri) {
        try {
          recording = await saveLocalRecording(draft.encounterId, recordingUri, {
            durationSeconds: draft.durationSeconds || recorder.seconds,
            source: draft.recordingSource || recorder.recordingSource || 'recorded',
            retention: recordingDestination === 'local_only' ? 'never' : draft.retention,
          });
        } catch (caught) {
          if (!recording) throw caught;
        }
      }

      const occurredAtIso = draft.recordingStartedAt || draft.gatherSessionStartedAt || draft.updatedAt;
      const occurredAt = new Date(occurredAtIso);
      const safeOccurredAt = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
      const eventSnapshot = await resolveCachedEventSnapshot(safeOccurredAt);
      const payload = buildEncounterPayload({
        id: draft.encounterId,
        transcript: draft.transcript,
        title: draft.title,
        personName: draft.personName,
        personEmail: draft.personEmail,
        people: draft.people,
        contactId: resolveContactIdForDraft(draft) || undefined,
        exchangeId: draft.exchangeId || undefined,
        sharedSummary: draft.sharedSummary,
        privateNotes: draft.privateNotes,
        manualFollowUps: draft.manualFollowUps.map((item) => ({
          title: item.title,
          channel: item.channel,
          owner: item.owner,
          targetPersonId: item.targetPersonId,
          dueAt: item.dueAt,
        })),
        commitments: commitmentSuggestions.flatMap((commitment, index) => {
          const key = commitmentKey(commitment, index);
          if (!selectedCommitmentKeys.includes(key)) return [];
          const assignment = commitmentAssignments[key] ?? { owner: commitment.owner, targetName: commitment.ownerName };
          return [{ ...commitment, owner: assignment.owner, ownerName: assignment.targetName }];
        }),
        consentMethod: draft.consentMethod,
        consentConfirmed: draft.captureMode === 'recording' ? draft.consent : false,
        status: 'draft',
        durationSeconds: draft.durationSeconds || recorder.seconds,
        recording: recording ?? undefined,
        startedAt: safeOccurredAt.toISOString(),
        eventId: eventSnapshot?.eventId,
      });
      await saveEncounter(token, payload);

      if (recording?.localUri && recordingDestination === 'google_drive') {
        try {
          const driveRecording = await uploadEncounterRecordingToDrive(
            token,
            draft.encounterId,
            recording.localUri,
          );
          recording = {
            ...recording,
            ...driveRecording,
            localUri: recording.localUri,
            audioLocation: 'google_drive',
          };
          await saveEncounter(token, { ...payload, recording });
        } catch (caught) {
          const driveError = caught instanceof Error
            ? caught.message
            : 'Google Drive could not save this recording. Your local copy is still safe.';
          showCaptureError(`${driveError} Open Connected accounts to reconnect Google, then retry from this draft.`);
          return;
        }
      }

      if (recording?.localUri && recordingDestination === 'onedrive') {
        try {
          const oneDriveRecording = await uploadEncounterRecordingToOneDrive(
            token,
            draft.encounterId,
            recording.localUri,
          );
          recording = {
            ...recording,
            ...oneDriveRecording,
            localUri: recording.localUri,
            audioLocation: 'onedrive',
          };
          await saveEncounter(token, { ...payload, recording });
        } catch (caught) {
          const oneDriveError = caught instanceof Error
            ? caught.message
            : 'OneDrive could not save this recording. Your local copy is still safe.';
          showCaptureError(`${oneDriveError} Open Connected accounts to reconnect Microsoft, then retry from this draft.`);
          return;
        }
      }
      await deleteCaptureDraft(draft.encounterId);
      router.replace(`/capture/${payload.id}`);
    } catch (caught) {
      showCaptureError(describeError(caught, 'Could not save this meeting.'));
    } finally {
      setSaving(false);
    }
  }

  const editingManualFollowUp = draft.manualFollowUps.find((item) => item.id === editingManualFollowUpId) || null;
  const editingManualFollowUpPronoun = editingManualFollowUp?.owner === 'guest' ? 'they' : 'you';

  return (
    <View style={[styles.safe, { paddingTop: insets.top + spacing.x2, paddingBottom: insets.bottom }]}>
      {!draftReady ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.ink} size="large" />
          <Text style={styles.loadingCopy}>Loading capture…</Text>
        </View>
      ) : (
      <View style={styles.page}>
        <View style={styles.header}>
          <PageHeader
            eyebrow={draft.step === 0
              ? draft.captureMode === 'recording'
                ? 'Get consent, then record'
                : 'Write what mattered'
              : 'Meeting context'}
            title={draft.step === 0
              ? draft.captureMode === 'recording'
                ? 'Record this conversation'
                : 'Add notes'
              : 'What mattered in this meeting?'}
            titleStyle={styles.title}
            onBack={requestLeave}
            rightAction={draft.step === 0 && !activeRecording ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={draft.captureMode === 'recording' ? 'Use notes instead' : 'Record instead'}
                onPress={() => {
                  updateDraft({
                    captureMode: draft.captureMode === 'recording' ? 'quick_context' : 'recording',
                  });
                  setInteractionPathStarted(true);
                }}
                style={styles.headerModeAction}
                hitSlop={8}>
                <Text style={styles.headerModeActionText}>
                  {draft.captureMode === 'recording' ? 'Use notes' : 'Record'}
                </Text>
              </Pressable>
            ) : undefined}
          />
          {eventContext ? (
            <Text style={styles.eventContext}>
              At {eventContext.eventTitle}{eventContext.eventLocation ? ` · ${eventContext.eventLocation}` : ''}
            </Text>
          ) : null}
        </View>

        {!activeRecording && draft.step > 0 ? <View style={styles.stepperWrap}>
          <CaptureStepIndicator current={draft.step} onStep={goToStep} />
        </View> : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <OfflineBanner
            message="Offline. This capture is saving to your device and will sync once you're back online."
            style={styles.offlineBanner}
          />
          {draft.step === 0 ? (
            <CaptureInteractionStep
              draft={draft}
              onDraftChange={updateDraft}
              consent={draft.consent}
              consentMethod={draft.consentMethod}
              onConsentChange={(value) => updateDraft({ consent: value })}
              onConsentMethodChange={(value) => updateDraft({ consentMethod: value })}
              recorder={recorder}
              signedIn={Boolean(session?.access_token)}
              exchanges={sessionExchanges}
              loadingExchanges={loadingExchanges}
              onLinkExchange={linkExchange}
              connections={connections}
              onLinkConnection={linkConnection}
              onEnsureAuth={ensureAuth}
              getPriorMeetingCount={getPriorMeetingCount}
              knownConnectionEmails={connections.map((connection) => connection.email?.trim().toLowerCase() || '').filter(Boolean)}
              onPathStateChange={setInteractionPathStarted}
              openConsentOnMount={params.openConsent === '1'}
            />
          ) : null}

          {draft.step === 1 ? (
            <CaptureContextStep
              draft={draft}
              onDraftChange={updateDraft}
              refreshing={extracting}
              isGenerating={generationStatus === 'generating'}
              isTranscribing={isTranscribing}
              generationError={generationError}
              onRefresh={() => {
                generationKickoffRef.current = '';
                setGenerationStatus('idle');
                void generateMeetingContext(draft.transcript.trim());
              }}
              uncertainFields={uncertainFields}
            />
          ) : null}

          {draft.step === 2 ? (
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <PaperPlaneTilt size={18} color={colors.ink} weight="bold" />
                <Text style={styles.blockTitle}>What happens next?</Text>
              </View>
              <Body>Pick how you want to follow up, add any private notes, then save and review.</Body>
              {isTranscribing || generationStatus === 'generating' ? (
                <View style={styles.backgroundStatus}>
                  <ActivityIndicator size="small" color={colors.ink} />
                  <View style={styles.backgroundStatusCopy}>
                    <Text style={styles.backgroundStatusTitle}>Preparing the meeting review</Text>
                    <Text style={styles.backgroundStatusBody}>
                      Set the follow-up, channel, and reminder now. We’ll notify you when the transcript is ready.
                    </Text>
                  </View>
                </View>
              ) : null}
              {commitmentSuggestions.length ? (
                <View style={styles.commitmentPanel}>
                  <Text style={styles.commitmentTitle}>Suggested from the conversation</Text>
                  <Text style={styles.fieldHint}>Every included promise becomes its own follow-up. Remove any suggestion that is wrong.</Text>
                  {commitmentSuggestions.map((commitment, sourceIndex) => ({ commitment, sourceIndex })).map(({ commitment, sourceIndex }) => {
                    const key = commitmentKey(commitment, sourceIndex);
                    const selected = selectedCommitmentKeys.includes(key);
                    const assignment = commitmentAssignments[key] ?? { owner: commitment.owner, targetName: commitment.ownerName };
                    return <View key={key} style={[styles.commitmentOption, selected && styles.commitmentOptionSelected]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setSelectedCommitmentKeys((current) => (
                          current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
                        ))}
                        style={styles.commitmentToggle}>
                        <View style={styles.commitmentCopy}>
                          <Text style={styles.commitmentOptionTitle}>{commitment.title}</Text>
                          <Text style={styles.commitmentMeta}>
                            {commitment.channel}{commitment.dueAt ? ` · due ${commitment.dueAt}` : ' · no due date agreed'}
                          </Text>
                        </View>
                        <Text style={styles.commitmentUse}>{selected ? 'Included' : 'Add'}</Text>
                      </Pressable>
                      {selected ? <View style={styles.commitmentAssignment}>
                        <Text style={styles.commitmentAssignmentLabel}>Owner</Text>
                        <View style={styles.commitmentAssignmentRow}>
                          <Pressable onPress={() => setCommitmentAssignments((current) => ({
                            ...current,
                            [key]: { owner: 'me', targetName: current[key]?.targetName || draft.people[0]?.name || '' },
                          }))} style={[styles.assignmentChip, assignment.owner === 'me' && styles.assignmentChipSelected]}>
                            <Text style={[styles.assignmentChipText, assignment.owner === 'me' && styles.assignmentChipTextSelected]}>You</Text>
                          </Pressable>
                          {draft.people.map((person) => <Pressable key={person.id} onPress={() => setCommitmentAssignments((current) => ({
                            ...current,
                            [key]: { owner: 'guest', targetName: person.name },
                          }))} style={[styles.assignmentChip, assignment.owner === 'guest' && assignment.targetName === person.name && styles.assignmentChipSelected]}>
                            <Text style={[styles.assignmentChipText, assignment.owner === 'guest' && assignment.targetName === person.name && styles.assignmentChipTextSelected]}>{person.name || 'Guest'}</Text>
                          </Pressable>)}
                        </View>
                        {assignment.owner === 'me' && draft.people.length > 1 ? <>
                          <Text style={styles.commitmentAssignmentLabel}>Track with</Text>
                          <View style={styles.commitmentAssignmentRow}>
                            {draft.people.map((person) => <Pressable key={person.id} onPress={() => setCommitmentAssignments((current) => ({
                              ...current,
                              [key]: { ...assignment, targetName: person.name },
                            }))} style={[styles.assignmentChip, assignment.targetName === person.name && styles.assignmentChipSelected]}>
                              <Text style={[styles.assignmentChipText, assignment.targetName === person.name && styles.assignmentChipTextSelected]}>{person.name || 'Guest'}</Text>
                            </Pressable>)}
                          </View>
                        </> : null}
                      </View> : null}
                    </View>;
                  })}
                </View>
              ) : null}
              {draft.manualFollowUps.length ? (
                <View style={styles.actionList}>
                  {draft.manualFollowUps.map((item) => {
                    const channelLabel = FOLLOW_UP_CHANNELS.find((entry) => entry.id === item.channel)?.label || item.channel;
                    const person = draft.people.find((candidate) => candidate.id === item.targetPersonId);
                    const ownerLabel = item.owner === 'me'
                      ? (person?.name ? `You → ${person.name}` : 'You')
                      : (person?.name || draft.personName.trim() || 'Guest');
                    const dueLabel = formatDueLabel(item.dueAt);
                    return (
                      <View key={item.id} style={styles.actionItem}>
                        <View style={styles.actionRow}>
                          <View style={styles.actionCopy}>
                            <Text style={styles.actionTitle}>{displayFollowUpTitle(item.title, item.channel)}</Text>
                            <Text style={styles.fieldHint}>{ownerLabel} · {channelLabel}{dueLabel ? ` · ${dueLabel}` : ''}</Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${displayFollowUpTitle(item.title, item.channel)}`}
                            onPress={() => setEditingManualFollowUpId(item.id)}
                            hitSlop={8}>
                            <PencilSimple size={19} color={colors.ink} weight="bold" />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${displayFollowUpTitle(item.title, item.channel)}`}
                            onPress={() => removeManualFollowUp(item.id)}
                            hitSlop={8}>
                            <Trash size={19} color={colors.muted} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => setManualFollowUpSheetOpen(true)}
                style={styles.actionComposerToggle}>
                <View style={styles.actionComposerToggleCopy}>
                  <Plus size={17} color={colors.ink} weight="bold" />
                  <Text style={styles.actionComposerToggleText}>
                    {draft.manualFollowUps.length ? 'Add another follow-up' : 'Create a follow-up'}
                  </Text>
                </View>
              </Pressable>

              <View style={styles.divider} />

              <BottomSheet
                visible={manualFollowUpSheetOpen}
                title="Add a follow-up"
                onClose={() => setManualFollowUpSheetOpen(false)}
                footer={
                  <Button onPress={addManualFollowUp}>
                    <Plus size={18} color={colors.white} weight="bold" />
                    Add follow-up
                  </Button>
                }>
                {(() => {
                  const pronoun = newFollowUpOwner === 'me' ? 'you' : 'they';
                  return (
                    <>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Owner</Text>
                        <View style={styles.channelRow}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected: newFollowUpOwner === 'me' }}
                            onPress={() => {
                              setNewFollowUpOwner('me');
                              setNewFollowUpTargetPersonId((current) => current || draft.people[0]?.id || '');
                            }}
                            style={[styles.channelChip, newFollowUpOwner === 'me' && styles.channelChipActive]}>
                            <Text style={[styles.channelText, newFollowUpOwner === 'me' && styles.channelTextActive]}>You</Text>
                          </Pressable>
                          {draft.people.length ? draft.people.map((person) => {
                            const selected = newFollowUpOwner === 'guest' && newFollowUpTargetPersonId === person.id;
                            return (
                              <Pressable
                                key={person.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => {
                                  setNewFollowUpOwner('guest');
                                  setNewFollowUpTargetPersonId(person.id);
                                }}
                                style={[styles.channelChip, selected && styles.channelChipActive]}>
                                <Text style={[styles.channelText, selected && styles.channelTextActive]}>{person.name.trim() || 'Guest'}</Text>
                              </Pressable>
                            );
                          }) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: newFollowUpOwner === 'guest' }}
                              onPress={() => {
                                setNewFollowUpOwner('guest');
                                setNewFollowUpTargetPersonId('');
                              }}
                              style={[styles.channelChip, newFollowUpOwner === 'guest' && styles.channelChipActive]}>
                              <Text style={[styles.channelText, newFollowUpOwner === 'guest' && styles.channelTextActive]}>{draft.personName.trim() || 'Guest'}</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                      {newFollowUpOwner === 'me' && draft.people.length > 1 ? (
                        <View style={styles.fieldGroup}>
                          <Text style={styles.label}>Track with</Text>
                          <View style={styles.channelRow}>
                            {draft.people.map((person) => {
                              const selected = (newFollowUpTargetPersonId || draft.people[0]?.id) === person.id;
                              return (
                                <Pressable
                                  key={person.id}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  onPress={() => setNewFollowUpTargetPersonId(person.id)}
                                  style={[styles.channelChip, selected && styles.channelChipActive]}>
                                  <Text style={[styles.channelText, selected && styles.channelTextActive]}>{person.name.trim() || 'Guest'}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}
                      <View style={styles.fieldGroup}>
                        <Text style={styles.label}>How do {pronoun} want to follow up?</Text>
                        <View style={styles.channelRow}>
                          {SELECTABLE_FOLLOW_UP_CHANNELS.map((channel) => {
                            const selected = newFollowUpChannel === channel.id;
                            return (
                              <Pressable
                                key={channel.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => setNewFollowUpChannel(channel.id)}
                                style={[styles.channelChip, selected && styles.channelChipActive]}>
                                <Text style={[styles.channelText, selected && styles.channelTextActive]}>
                                  {channel.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      <FollowUpDuePicker
                        dueAt={newFollowUpDueAt}
                        onChange={setNewFollowUpDueAt}
                        label={`When should ${pronoun} do this?`}
                      />
                      <View style={styles.fieldGroup}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: newFollowUpDetailOpen }}
                          onPress={() => setNewFollowUpDetailOpen((value) => !value)}
                          style={styles.detailToggle}>
                          <Text style={styles.label}>What do {pronoun} need to do? (optional)</Text>
                          {newFollowUpDetailOpen ? (
                            <CaretUp size={16} color={colors.ink} weight="bold" />
                          ) : (
                            <CaretDown size={16} color={colors.ink} weight="bold" />
                          )}
                        </Pressable>
                        {newFollowUpDetailOpen ? (
                          <>
                            <Text style={styles.fieldHint}>Shown in your reminders so you know what this one&apos;s about.</Text>
                            <TextInput
                              value={newFollowUpTitle}
                              onChangeText={setNewFollowUpTitle}
                              placeholder="Send the proposal on Friday"
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

              <BottomSheet
                visible={Boolean(editingManualFollowUp)}
                title="Edit follow-up"
                onClose={() => setEditingManualFollowUpId('')}
                footer={<Button onPress={() => setEditingManualFollowUpId('')}>Done</Button>}>
                {editingManualFollowUp ? (
                  <>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Owner</Text>
                      <View style={styles.channelRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: editingManualFollowUp.owner === 'me' }}
                          onPress={() => updateManualFollowUp(editingManualFollowUp.id, {
                            owner: 'me',
                            targetPersonId: editingManualFollowUp.targetPersonId || draft.people[0]?.id || '',
                          })}
                          style={[styles.channelChip, editingManualFollowUp.owner === 'me' && styles.channelChipActive]}>
                          <Text style={[styles.channelText, editingManualFollowUp.owner === 'me' && styles.channelTextActive]}>You</Text>
                        </Pressable>
                        {draft.people.length ? draft.people.map((candidate) => {
                          const selected = editingManualFollowUp.owner === 'guest' && editingManualFollowUp.targetPersonId === candidate.id;
                          return (
                            <Pressable
                              key={candidate.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => updateManualFollowUp(editingManualFollowUp.id, { owner: 'guest', targetPersonId: candidate.id })}
                              style={[styles.channelChip, selected && styles.channelChipActive]}>
                              <Text style={[styles.channelText, selected && styles.channelTextActive]}>{candidate.name.trim() || 'Guest'}</Text>
                            </Pressable>
                          );
                        }) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected: editingManualFollowUp.owner === 'guest' }}
                            onPress={() => updateManualFollowUp(editingManualFollowUp.id, { owner: 'guest', targetPersonId: '' })}
                            style={[styles.channelChip, editingManualFollowUp.owner === 'guest' && styles.channelChipActive]}>
                            <Text style={[styles.channelText, editingManualFollowUp.owner === 'guest' && styles.channelTextActive]}>{draft.personName.trim() || 'Guest'}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                    {editingManualFollowUp.owner === 'me' && draft.people.length > 1 ? (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Track with</Text>
                        <View style={styles.channelRow}>
                          {draft.people.map((candidate) => {
                            const selected = (editingManualFollowUp.targetPersonId || draft.people[0]?.id) === candidate.id;
                            return (
                              <Pressable
                                key={candidate.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => updateManualFollowUp(editingManualFollowUp.id, { targetPersonId: candidate.id })}
                                style={[styles.channelChip, selected && styles.channelChipActive]}>
                                <Text style={[styles.channelText, selected && styles.channelTextActive]}>{candidate.name.trim() || 'Guest'}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>How do {editingManualFollowUpPronoun} want to follow up?</Text>
                      <View style={styles.channelRow}>
                        {SELECTABLE_FOLLOW_UP_CHANNELS.map((channel) => {
                          const selected = editingManualFollowUp.channel === channel.id;
                          return (
                            <Pressable
                              key={channel.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => updateManualFollowUp(editingManualFollowUp.id, { channel: channel.id })}
                              style={[styles.channelChip, selected && styles.channelChipActive]}>
                              <Text style={[styles.channelText, selected && styles.channelTextActive]}>{channel.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <FollowUpDuePicker
                      dueAt={editingManualFollowUp.dueAt}
                      onChange={(dueAt) => updateManualFollowUp(editingManualFollowUp.id, { dueAt })}
                      label={`When should ${editingManualFollowUpPronoun} do this?`}
                    />
                    <View style={styles.fieldGroup}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: Boolean(manualFollowUpDetailOpen[editingManualFollowUp.id]) }}
                        onPress={() => setManualFollowUpDetailOpen((current) => ({ ...current, [editingManualFollowUp.id]: !current[editingManualFollowUp.id] }))}
                        style={styles.detailToggle}>
                        <Text style={styles.label}>What do {editingManualFollowUpPronoun} need to do? (optional)</Text>
                        {manualFollowUpDetailOpen[editingManualFollowUp.id] ? (
                          <CaretUp size={16} color={colors.ink} weight="bold" />
                        ) : (
                          <CaretDown size={16} color={colors.ink} weight="bold" />
                        )}
                      </Pressable>
                      {manualFollowUpDetailOpen[editingManualFollowUp.id] ? (
                        <>
                          <Text style={styles.fieldHint}>Shown in your reminders so you know what this one&apos;s about.</Text>
                          <TextInput
                            value={editingManualFollowUp.title}
                            onChangeText={(value) => updateManualFollowUp(editingManualFollowUp.id, { title: value })}
                            placeholder="Send the proposal on Friday"
                            placeholderTextColor={colors.muted}
                            style={styles.input}
                          />
                        </>
                      ) : null}
                    </View>
                  </>
                ) : null}
              </BottomSheet>

              <Pressable
                accessibilityRole="button"
                onPress={() => setPrivateNotesSheetOpen(true)}
                style={styles.optionalSectionToggle}>
                <View style={styles.optionalSectionCopy}>
                  <Text style={styles.optionalSectionTitle}>Private notes</Text>
                  <Text style={styles.optionalSectionHint} numberOfLines={1}>
                    {draft.privateNotes.trim() || 'Optional and never shared.'}
                  </Text>
                </View>
                {draft.privateNotes.trim() ? (
                  <PencilSimple size={18} color={colors.ink} weight="bold" />
                ) : (
                  <Plus size={18} color={colors.ink} weight="bold" />
                )}
              </Pressable>
              <BottomSheet
                visible={privateNotesSheetOpen}
                title="Private notes"
                onClose={() => setPrivateNotesSheetOpen(false)}
                footer={<Button onPress={() => setPrivateNotesSheetOpen(false)}>Done</Button>}>
                <Text style={styles.fieldHint}>Only you can see this. Never shared with participants.</Text>
                <TextInput
                  value={draft.privateNotes}
                  onChangeText={(value) => updateDraft({ privateNotes: value })}
                  multiline
                  scrollEnabled
                  autoFocus
                  placeholder="Anything you want to remember for yourself…"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.textarea]}
                />
              </BottomSheet>

              {draft.captureMode === 'recording' && (draft.recordingUri || recorder.recordingUri) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/settings/connected-accounts')}
                  style={styles.recordingStorageRow}>
                  {recordingStorageDestination === 'local_only'
                    ? <DeviceMobile size={16} color={colors.muted} weight="bold" />
                    : <CloudArrowUp size={16} color={colors.muted} weight="bold" />}
                  <Text style={styles.recordingStorageText}>
                    Recording saves to {recordingStorageDestinationLabel(recordingStorageDestination)}
                  </Text>
                  <Text style={styles.recordingStorageAction}>Change</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {message ? (
            <View style={styles.syncMessage}>
              <Text style={syncConflict ? styles.error : styles.success}>{message}</Text>
              {syncConflict ? (
                <Button variant="secondary" onPress={() => void reloadLatestRemoteCapture()}>
                  Load latest capture
                </Button>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {!activeRecording ? <View style={styles.footer}>
          {draft.step > 0 ? <FooterBackButton onPress={() => goToStep(draft.step - 1)} /> : null}
          {draft.step === 0 && hasStartedInteraction ? (
            <>
              <Button
                style={{ flex: 1 }}
                onPress={() => void continueFromInteraction(false)}
                disabled={
                  (draft.captureMode === 'recording' && !draft.consent)
                  || !hasValidGatherPeople(draft.people ?? [])
                }>
                {draft.captureMode === 'quick_context' ? 'Add context' : 'Set follow-up'}
              </Button>
            </>
          ) : null}
          {draft.step === 1 ? (
            <Button
              style={{ flex: 1 }}
              onPress={continueFromContext}
              disabled={contextNextDisabled}
              loading={contextNextLoading}>
              Next
            </Button>
          ) : null}
          {draft.step === 2 ? (
            <Button style={{ flex: 1 }} loading={saving} onPress={() => void saveAndReview()}>
              Save & review
            </Button>
          ) : null}
        </View> : null}
      </View>
      )}
      <CaptureErrorSheet
        visible={errorSheetOpen}
        message={error}
        onClose={closeErrorSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x3,
  },
  loadingCopy: { color: colors.muted, fontSize: 14 },
  page: { flex: 1 },
  header: { paddingHorizontal: spacing.x5 },
  offlineBanner: { marginTop: spacing.x2 },
  eventContext: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  headerModeAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.x2,
  },
  headerModeActionText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  title: { fontSize: 30, lineHeight: 32 },
  stepperWrap: { marginTop: spacing.x5, paddingHorizontal: spacing.x5 },
  scroll: { flex: 1, marginTop: spacing.x4 },
  scrollContent: { paddingHorizontal: spacing.x5, paddingBottom: spacing.x6, gap: spacing.x4 },
  block: {
    gap: spacing.x4,
    padding: spacing.x5,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
  },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  blockTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  backgroundStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  backgroundStatusCopy: { flex: 1, gap: spacing.x1 },
  backgroundStatusTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  backgroundStatusBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  sourcePanel: {
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  sourceToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  sourceCopy: { flex: 1, gap: 2 },
  sourceHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  fieldHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  recordingStorageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    paddingTop: spacing.x3,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  recordingStorageText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 18 },
  recordingStorageAction: { color: colors.ink, fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' },
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
  textarea: { height: 140, maxHeight: 140, paddingTop: spacing.x3, textAlignVertical: 'top' },
  notesField: { height: 140, maxHeight: 140, paddingTop: spacing.x3, textAlignVertical: 'top' },
  transcriptField: { height: 220, maxHeight: 220, paddingTop: spacing.x3, textAlignVertical: 'top' },
  draftNote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  uncertain: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  extractRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  extractCopy: { color: colors.muted, fontSize: 12 },
  exchangeList: { gap: spacing.x3 },
  exchangeCard: {
    gap: spacing.x1,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  exchangeCardSelected: {
    borderColor: colors.ink,
    backgroundColor: colors.surfaceMuted,
  },
  exchangeName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  exchangeMeta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  exchangeSelected: { color: colors.ink, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  emptyCopy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  fieldGroup: { gap: spacing.x3 },
  divider: { height: 1, backgroundColor: colors.line },
  actionList: { gap: spacing.x2 },
  actionItem: { overflow: 'hidden', borderRadius: radius.medium, backgroundColor: colors.canvas },
  actionRow: { minHeight: 54, padding: spacing.x3, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, borderRadius: radius.medium, backgroundColor: colors.canvas },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
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
  detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionalSectionToggle: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  optionalSectionCopy: { flex: 1, gap: 3 },
  optionalSectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  optionalSectionHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  previewChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x1 },
  previewChip: {
    paddingHorizontal: spacing.x2,
    paddingVertical: 2,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  previewChipText: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  optionalSectionBody: {
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  commitmentPanel: {
    gap: spacing.x2,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  commitmentTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  commitmentOption: {
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  commitmentOptionSelected: {
    borderColor: colors.ink,
    backgroundColor: '#E3F6D7',
  },
  commitmentToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3, padding: spacing.x3 },
  commitmentAssignment: { gap: spacing.x2, paddingHorizontal: spacing.x3, paddingBottom: spacing.x3 },
  commitmentAssignmentLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  commitmentAssignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  assignmentChip: { paddingHorizontal: spacing.x3, paddingVertical: spacing.x2, borderRadius: radius.round, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  assignmentChipSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  assignmentChipText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  assignmentChipTextSelected: { color: colors.white },
  commitmentCopy: { flex: 1, gap: 3 },
  commitmentOptionTitle: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  commitmentMeta: { color: colors.muted, fontSize: 11, lineHeight: 16, textTransform: 'capitalize' },
  commitmentUse: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  channelChip: {
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  channelChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  channelText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  channelTextActive: { color: colors.white },
  success: { color: '#2F5711', fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  syncMessage: { gap: spacing.x2, alignItems: 'flex-start' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.x2,
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x3,
    paddingBottom: spacing.x2,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.canvas,
  },
});

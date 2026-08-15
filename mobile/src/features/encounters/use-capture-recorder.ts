import * as DocumentPicker from 'expo-document-picker';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useLiveTranscript, type LiveTranscriptStatus } from '@/features/encounters/live-transcript';
import {
  NativeSpeechCapture,
  isNativeSpeechTranscriptionAvailable,
  resolveSpeechCaptureMode,
  type SpeechCaptureMode,
} from '@/features/encounters/native-speech-transcript';
import { isSupportedAudioImport } from '@/features/encounters/audio-upload';
import { ensureRecordingsDirectory, formatDuration, recordingsDirectory } from '@/features/encounters/local-recordings';
import { isOnline } from '@/lib/connectivity';
import { describeError } from '@/lib/friendly-error';
import { isNetworkError } from '@/lib/mobile-api';
import { isExpoGo } from '@/lib/runtime';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';
export type TranscriptStatus = LiveTranscriptStatus;
export type ImportRecordingMeta = {
  fileName?: string;
  mimeType?: string;
  interrupted?: boolean;
  /** All completed segment URIs so far, including the one this change is for. */
  segments?: string[];
};
export type ServerTranscribePhase = 'idle' | 'preparing' | 'transcribing' | 'revealing' | 'done' | 'failed';

type UseCaptureRecorderOptions = {
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onDurationChange: (seconds: number) => void;
  onRecordingUriChange: (uri: string, source: 'recorded' | 'imported', meta?: ImportRecordingMeta) => void;
  onError: (message: string) => void;
  onImportReady?: () => void;
  onImportStarted?: () => void;
  onTranscriptFinalized?: (transcript: string) => void;
  transcribeFromServer?: (uri: string, meta?: ImportRecordingMeta) => Promise<string | null>;
};

/**
 * Mono, 16kHz, 32kbps AAC — Whisper resamples everything to 16kHz mono anyway, so the
 * stereo 44.1kHz/128kbps HIGH_QUALITY preset was spending ~4x the bytes for no
 * transcription benefit. At this bitrate a full MAX_RECORDING_SECONDS (1hr) clip is
 * ~14MB, comfortably under Whisper's 25MB upload limit (see audio-upload.ts).
 */
const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  directory: 'document',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

/** Hard cap for on-device capture — auto Finish when reached. */
export const MAX_RECORDING_SECONDS = 60 * 60;

// Grace period before the interruption watchdog trusts isRecording:false —
// covers the native catch-up window right after calling record(). Android's
// MediaRecorder start-up latency runs longer than iOS's AVAudioRecorder,
// especially on older hardware, so it gets a wider window to avoid false
// positives on Pause -> Resume.
const INTERRUPTION_GRACE_MS = Platform.OS === 'android' ? 3500 : 2000;

// Below this length a transcript isn't considered usable — reused by the
// background transcription-retry sweep so its threshold can't silently
// drift from this hook's.
export const MIN_USABLE_TRANSCRIPT_LENGTH = 20;

export function useCaptureRecorder({
  transcript,
  onTranscriptChange,
  onDurationChange,
  onRecordingUriChange,
  onError,
  onImportReady,
  onImportStarted,
  onTranscriptFinalized,
  transcribeFromServer,
}: UseCaptureRecorderOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [recordingUri, setRecordingUri] = useState('');
  // Prior takes from before an interruption forced a new file. `recordingUri`
  // is always the current/latest segment; these are archived ones, stitched
  // into one file at save time so nothing downstream needs to know a
  // recording was ever split.
  const [recordingSegments, setRecordingSegments] = useState<string[]>([]);
  const [recordingSource, setRecordingSource] = useState<'recorded' | 'imported'>('recorded');
  const [playbackReady, setPlaybackReady] = useState(false);
  const [playbackSource, setPlaybackSource] = useState<string | null>(null);
  const [speechAudioLevel, setSpeechAudioLevel] = useState(0);
  const [speechSeconds, setSpeechSeconds] = useState(0);
  const [captureMode, setCaptureMode] = useState<SpeechCaptureMode>(() => resolveSpeechCaptureMode());
  const [serverTranscribePhase, setServerTranscribePhase] = useState<ServerTranscribePhase>('idle');
  const [serverTranscribeError, setServerTranscribeError] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);

  const recordingStateRef = useRef<RecordingState>('idle');
  const speechCaptureRef = useRef(new NativeSpeechCapture());
  const liveSttReceivedRef = useRef(false);
  const speechTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRecordingRef = useRef<(reason?: 'interrupted') => Promise<void>>(async () => {});
  const interruptionHandledRef = useRef(false);
  // When the current native take actually started — used to grace-period the
  // interruption watchdog's post-record() catch-up window. This must be
  // per-take, not derived from cumulative `seconds`: on a resumed recording,
  // `seconds` already carries the prior segments' total, so a `seconds >= 2`
  // check would be satisfied instantly and give the new take no grace period
  // at all, misreading its own startup catch-up window as an interruption.
  const takeStartedAtRef = useRef(0);
  // Cumulative transcript/duration from segments completed before the
  // current one — kept outside React state since they're only ever read
  // synchronously inside stopRecording/continueRecording, never rendered.
  const priorTranscriptRef = useRef('');
  const priorDurationRef = useRef(0);
  const [priorDurationSeconds, setPriorDurationSeconds] = useState(0);
  const finishPromiseRef = useRef<Promise<void> | null>(null);
  const lastTranscribeMetaRef = useRef<ImportRecordingMeta | undefined>(undefined);
  const onErrorRef = useRef(onError);
  const onImportReadyRef = useRef(onImportReady);
  const onImportStartedRef = useRef(onImportStarted);
  const onTranscriptFinalizedRef = useRef(onTranscriptFinalized);
  const transcribeFromServerRef = useRef(transcribeFromServer);
  const captureModeRef = useRef<SpeechCaptureMode>(captureMode);

  useEffect(() => {
    onErrorRef.current = onError;
    onImportReadyRef.current = onImportReady;
    onImportStartedRef.current = onImportStarted;
    onTranscriptFinalizedRef.current = onTranscriptFinalized;
    transcribeFromServerRef.current = transcribeFromServer;
    captureModeRef.current = captureMode;
  }, [captureMode, onError, onImportReady, onImportStarted, onTranscriptFinalized, transcribeFromServer]);

  const liveTranscript = useLiveTranscript({ transcript, onTranscriptChange });

  const audioRecorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const player = useAudioPlayer(playbackSource);

  const usingSpeechCapture = captureMode === 'unified' || captureMode === 'transcript-only';

  const seconds = useMemo(
    () => (usingSpeechCapture
      ? speechSeconds
      // Cumulative across segments — durationMillis alone only reflects the
      // current take, which would otherwise visibly reset after a resume.
      : priorDurationSeconds + Math.max(0, Math.round(recorderState.durationMillis / 1000))),
    [priorDurationSeconds, recorderState.durationMillis, speechSeconds, usingSpeechCapture],
  );

  const audioLevel = useMemo(() => {
    if (usingSpeechCapture) return speechAudioLevel;
    if (typeof recorderState.metering !== 'number') return 0;
    return Math.min(1, Math.max(0, (recorderState.metering + 160) / 160));
  }, [recorderState.metering, speechAudioLevel, usingSpeechCapture]);

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  useEffect(() => {
    if (recordingState !== 'recording' && recordingState !== 'paused') return;
    const display = liveTranscript.displayTranscript.trim();
    if (!display) return;

    const timer = setTimeout(() => {
      onTranscriptChange(display);
    }, 400);

    return () => clearTimeout(timer);
  }, [liveTranscript.displayTranscript, onTranscriptChange, recordingState]);

  useEffect(() => {
    void ensureRecordingsDirectory().catch(() => {});
    const speechCapture = speechCaptureRef.current;

    return () => {
      speechCapture.abort();
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (usingSpeechCapture) return;
    void setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      allowsBackgroundRecording: true,
    }).catch(() => {});
  }, [usingSpeechCapture]);

  const publishDuration = useCallback((nextSeconds: number) => {
    onDurationChange(nextSeconds);
  }, [onDurationChange]);

  const clearSpeechTimer = useCallback(() => {
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
      speechTimerRef.current = null;
    }
  }, []);

  const startSpeechTimer = useCallback(() => {
    clearSpeechTimer();
    speechTimerRef.current = setInterval(() => {
      setSpeechSeconds((current) => {
        const next = current + 1;
        publishDuration(next);
        if (next >= MAX_RECORDING_SECONDS) {
          void stopRecordingRef.current();
        }
        return next;
      });
    }, 1000);
  }, [clearSpeechTimer, publishDuration]);

  // Auto-stop expo-audio captures at the same 1-hour cap.
  useEffect(() => {
    if (usingSpeechCapture) return;
    if (recordingState !== 'recording' && recordingState !== 'paused') return;
    if (seconds < MAX_RECORDING_SECONDS) return;
    void stopRecordingRef.current();
  }, [recordingState, seconds, usingSpeechCapture]);

  // iOS can reset media services mid-recording (a system-level crash/reset,
  // typically from a call, Siri, another app grabbing the mic, or a
  // prolonged background session) — expo-audio surfaces this via
  // mediaServicesDidReset. When it fires, the native recorder is dead: its
  // duration silently drops to 0 while our own state still says "recording",
  // which looked like a broken/reset timer. The same silent-death pattern
  // can happen without that flag too (isRecording flips false on its own).
  // Rather than leave the UI stuck showing a dead "Recording" state, treat
  // either signal as an interruption and gracefully finish the segment
  // that's already safely on disk, with a clear explanation.
  useEffect(() => {
    if (usingSpeechCapture) return;
    if (recordingState !== 'recording') return;
    // `canRecord` is a general readiness flag, not "not currently recording" —
    // right after record() is called there's a brief window before the native
    // poll catches up where isRecording is still false with canRecord true.
    // Only trust that combination as a genuine mid-session drop once this take
    // has been running a couple of seconds; mediaServicesDidReset is an
    // explicit signal and doesn't need the same grace period.
    const takeElapsedMs = Date.now() - takeStartedAtRef.current;
    const interrupted = recorderState.mediaServicesDidReset
      || (takeElapsedMs >= INTERRUPTION_GRACE_MS && !recorderState.isRecording && recorderState.canRecord);
    if (!interrupted || interruptionHandledRef.current) return;
    interruptionHandledRef.current = true;
    onErrorRef.current(
      'Recording was interrupted by the system (a call, Siri, or another app using the microphone). '
      + 'What was captured up to that point is saved below. Start a new recording to keep going.',
    );
    void stopRecordingRef.current('interrupted');
  }, [
    recorderState.canRecord,
    recorderState.isRecording,
    recorderState.mediaServicesDidReset,
    recordingState,
    // Not read directly below, but ticks every second while recording so
    // this effect keeps re-evaluating the elapsed-time gate over time —
    // without it, the effect would only re-run on isRecording/canRecord
    // *transitions* and could miss the 2s grace period elapsing.
    seconds,
    usingSpeechCapture,
  ]);

  const transcribeErrorShownRef = useRef(false);
  const transcribeInFlightRef = useRef(false);
  const transcribedUriRef = useRef('');

  const maybeTranscribeFromServer = useCallback(async (
    uri: string,
    cleanedTranscript: string,
    meta?: ImportRecordingMeta,
    options?: { force?: boolean },
  ) => {
    const transcribe = transcribeFromServerRef.current;
    if (!transcribe) return cleanedTranscript;

    const normalizedUri = uri.trim();
    if (!normalizedUri) return cleanedTranscript;
    if (!options?.force && transcribedUriRef.current === normalizedUri) return cleanedTranscript;
    if (transcribeInFlightRef.current) return cleanedTranscript;

    const needsServer =
      cleanedTranscript.trim().length < MIN_USABLE_TRANSCRIPT_LENGTH ||
      !liveSttReceivedRef.current ||
      !isNativeSpeechTranscriptionAvailable();
    if (!needsServer) return cleanedTranscript;

    lastTranscribeMetaRef.current = meta;
    transcribeErrorShownRef.current = false;

    if (!isOnline()) {
      setServerTranscribePhase('failed');
      setServerTranscribeError("You're offline. This will retry automatically once you're back online.");
      liveTranscript.markIdle();
      return cleanedTranscript;
    }

    transcribeInFlightRef.current = true;
    setServerTranscribeError('');
    setServerTranscribePhase('preparing');
    liveTranscript.markTranscribing();
    try {
      setServerTranscribePhase('transcribing');
      const serverTranscript = await transcribe(normalizedUri, meta);
      if (serverTranscript?.trim()) {
        // A visual word-by-word reveal used to keep the recorder in a
        // processing state while awaiting JS timers. Mobile OS suspension can
        // pause those timers indefinitely, leaving the global capture banner
        // stuck even though transcription has already finished. Commit the
        // complete transcript atomically so the state machine can settle.
        liveTranscript.updateFromUser(serverTranscript);
        liveTranscript.markIdle();
        setServerTranscribePhase('done');
        transcribedUriRef.current = normalizedUri;
        onTranscriptFinalizedRef.current?.(serverTranscript);
        return serverTranscript;
      }
      const emptyMessage = 'No speech detected in this recording. Paste a transcript manually.';
      setServerTranscribePhase('failed');
      setServerTranscribeError(emptyMessage);
      liveTranscript.markIdle();
    } catch (error) {
      const message = isNetworkError(error)
        ? "You're offline. This will retry automatically once you're back online."
        : describeError(error, 'Could not transcribe this recording.');
      setServerTranscribePhase('failed');
      setServerTranscribeError(message);
      liveTranscript.markIdle();
    } finally {
      transcribeInFlightRef.current = false;
    }

    return cleanedTranscript;
  }, [liveTranscript]);

  const startSpeechCapture = useCallback(async (mode: SpeechCaptureMode) => {
    liveSttReceivedRef.current = false;
    liveTranscript.markListening();
    await ensureRecordingsDirectory();
    const started = await speechCaptureRef.current.start({
      mode,
      outputDirectory: recordingsDirectory(),
      onResult: (text, isFinal) => {
        if (text.trim()) liveSttReceivedRef.current = true;
        liveTranscript.appendSpeechResult(text, isFinal);
      },
      onVolume: setSpeechAudioLevel,
      onListening: () => liveTranscript.markListening(),
      onSegmentEnd: () => liveTranscript.commitPendingSpeech(),
      onError: (message) => onErrorRef.current(message),
      onUnavailable: () => liveTranscript.markUnavailable(),
    });
    if (!started) {
      liveTranscript.markUnavailable();
    }
    return started;
  }, [liveTranscript]);

  const startExpoAudioRecording = useCallback(async () => {
    await ensureRecordingsDirectory();
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      allowsBackgroundRecording: true,
    });
    await audioRecorder.prepareToRecordAsync(RECORDING_OPTIONS);
    audioRecorder.record();
    takeStartedAtRef.current = Date.now();
  }, [audioRecorder]);

  const stopExpoAudioRecording = useCallback(async () => {
    try {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }
    } catch {
      // still try to read uri below
    }
    // Expo sometimes exposes the URI a tick after stop.
    let uri = audioRecorder.uri ?? recorderState.url ?? null;
    if (!uri) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      uri = audioRecorder.uri ?? recorderState.url ?? null;
    }
    return uri;
  }, [audioRecorder, recorderState.url]);

  const stopSpeechCapture = useCallback(async () => {
    clearSpeechTimer();
    return speechCaptureRef.current.stop();
  }, [clearSpeechTimer]);

  const startRecording = useCallback(async (consent: boolean) => {
    if (!consent) {
      onErrorRef.current('Confirm that everyone agreed before recording.');
      return;
    }

    setPlaybackReady(false);
    setPlaybackSource(null);
    onErrorRef.current('');
    interruptionHandledRef.current = false;
    // A genuinely fresh recording (not a resume) starts with a clean slate —
    // no carried-over segments from whatever encounter was last open in this
    // shared recorder instance.
    priorTranscriptRef.current = '';
    priorDurationRef.current = 0;
    setPriorDurationSeconds(0);
    setRecordingSegments([]);

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      onErrorRef.current('Microphone access was not granted. Check Settings and try again.');
      return;
    }

    try {
      liveTranscript.resetForRecording();
      setSpeechSeconds(0);
      publishDuration(0);
      setSpeechAudioLevel(0);
      setRecordingState('recording');

      // Always record with expo-audio so Finish saves a real file on every device.
      // OpenAI Whisper builds the transcript after Finish.
      setCaptureMode('none');
      captureModeRef.current = 'none';
      liveTranscript.markListening();
      await startExpoAudioRecording();
    } catch {
      onErrorRef.current('Could not start recording. Check microphone permission and try again.');
      setRecordingState('idle');
    }
  }, [liveTranscript, publishDuration, startExpoAudioRecording]);

  /**
   * Starts a new take after a segment ended (typically the interruption
   * watchdog) without discarding what's already captured — unlike
   * resetRecording, which throws everything away for a genuine do-over.
   * expo-audio can't reopen an already-finalized .m4a to keep writing to it
   * (Apple's AVAudioRecorder has no append mode), so this really does start
   * a separate file; the accumulated transcript and duration carry forward
   * so the *session* reads as continuous even though the audio is now
   * multiple segments, stitched into one file at save time.
   */
  const continueRecording = useCallback(async (consent: boolean) => {
    if (!consent) {
      onErrorRef.current('Confirm that everyone agreed before recording.');
      return;
    }

    if (recordingUri) {
      setRecordingSegments((current) => [...current, recordingUri]);
    }
    // `seconds` is already cumulative (priorDurationRef + the current take),
    // so this is the new total, not an increment — using += here would
    // double-count everything accumulated before this take.
    priorDurationRef.current = seconds;
    setPriorDurationSeconds(seconds);

    setPlaybackReady(false);
    setPlaybackSource(null);
    onErrorRef.current('');
    interruptionHandledRef.current = false;

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      onErrorRef.current('Microphone access was not granted. Check Settings and try again.');
      return;
    }

    try {
      liveTranscript.resetForRecording();
      setRecordingUri('');
      setRecordingState('recording');
      setCaptureMode('none');
      captureModeRef.current = 'none';
      liveTranscript.markListening();
      await startExpoAudioRecording();
    } catch {
      onErrorRef.current('Could not resume recording. Check microphone permission and try again.');
      setRecordingState('idle');
    }
  }, [liveTranscript, recordingUri, seconds, startExpoAudioRecording]);

  const pauseOrResume = useCallback(async () => {
    if (recordingStateRef.current === 'recording') {
      liveTranscript.finalizeTranscript();
      if (usingSpeechCapture) {
        clearSpeechTimer();
        speechCaptureRef.current.abort();
      } else {
        audioRecorder.pause();
      }
      setRecordingState('paused');
      publishDuration(seconds);
      return;
    }

    if (recordingStateRef.current === 'paused') {
      liveTranscript.resetForRecording();
      setRecordingState('recording');
      if (usingSpeechCapture) {
        const started = await startSpeechCapture('unified');
        if (started) startSpeechTimer();
      } else {
        audioRecorder.record();
        // Same native catch-up window as any other record() call — without
        // resetting this, the interruption watchdog's grace period is
        // already satisfied by the time already accumulated before the
        // pause, so resuming would immediately misread its own startup lag
        // as an interruption.
        takeStartedAtRef.current = Date.now();
      }
    }
  }, [
    audioRecorder,
    clearSpeechTimer,
    liveTranscript,
    publishDuration,
    seconds,
    startSpeechCapture,
    startSpeechTimer,
    usingSpeechCapture,
  ]);

  const stopRecording = useCallback(async (reason?: 'interrupted') => {
    if (finishPromiseRef.current) {
      await finishPromiseRef.current;
      return;
    }
    if (recordingStateRef.current === 'stopped' && !isFinishing) return;

    const run = (async () => {
      recordingStateRef.current = 'stopped';
      setIsFinishing(true);
      setRecordingState('stopped');
      try {
        let uri: string | null = null;

        if (usingSpeechCapture) {
          liveTranscript.commitPendingSpeech();
          uri = await stopSpeechCapture();
          speechCaptureRef.current.resetSession();
        } else {
          uri = await stopExpoAudioRecording();
        }

        publishDuration(seconds);
        let cleaned = liveTranscript.finalizeTranscript();
        const mimeType = uri?.toLowerCase().includes('.wav')
          ? 'audio/wav'
          : uri?.toLowerCase().includes('.mp3')
            ? 'audio/mpeg'
            : 'audio/mp4';
        const fileName = uri?.split('/').pop()?.split('?')[0] || 'recording.m4a';

        if (uri) {
          if (!liveSttReceivedRef.current || cleaned.trim().length < 20) {
            cleaned = await maybeTranscribeFromServer(uri, cleaned, { fileName, mimeType }, { force: true });
          }
          // Fold in whatever segments came before this one so the transcript
          // always reads as one continuous meeting record, even across a
          // resume-after-interruption.
          const combined = [priorTranscriptRef.current, cleaned].filter((part) => part.trim()).join('\n\n');
          if (combined) onTranscriptFinalizedRef.current?.(combined);
          priorTranscriptRef.current = combined;
          const segmentsSoFar = [...recordingSegments, uri];
          setRecordingUri(uri);
          setRecordingSource('recorded');
          setPlaybackSource(uri);
          onRecordingUriChange(uri, 'recorded', {
            fileName,
            mimeType,
            interrupted: reason === 'interrupted',
            segments: segmentsSoFar,
          });
          setPlaybackReady(true);
          // Keep the interruption message on screen — the watchdog set it
          // moments ago and it would otherwise be silently wiped here.
          if (reason !== 'interrupted') onErrorRef.current('');
        } else if (cleaned.trim()) {
          const combined = [priorTranscriptRef.current, cleaned].filter((part) => part.trim()).join('\n\n');
          onTranscriptFinalizedRef.current?.(combined);
          priorTranscriptRef.current = combined;
          onErrorRef.current(
            'Transcript is ready, but no audio file was saved. Tap Record again. We need the file for playback and guest sharing.',
          );
        } else {
          onErrorRef.current('Finish stopped the session, but no audio was saved. Tap Record and try again.');
        }
      } catch (error) {
        const message = describeError(error, 'Finish stopped the session, but nothing was saved. Tap Record and try again.');
        onErrorRef.current(message);
      } finally {
        setIsFinishing(false);
      }
    })();

    finishPromiseRef.current = run;
    try {
      await run;
    } finally {
      if (finishPromiseRef.current === run) finishPromiseRef.current = null;
    }
  }, [
    isFinishing,
    liveTranscript,
    maybeTranscribeFromServer,
    onRecordingUriChange,
    publishDuration,
    recordingSegments,
    seconds,
    stopExpoAudioRecording,
    stopSpeechCapture,
    usingSpeechCapture,
  ]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const awaitPendingFinish = useCallback(async () => {
    if (finishPromiseRef.current) await finishPromiseRef.current;
  }, []);

  const hydrateFromDraft = useCallback((draft: {
    recordingUri?: string;
    recordingSource?: 'recorded' | 'imported' | '';
    transcript?: string;
    durationSeconds?: number;
    recordingSegments?: string[];
  }) => {
    if (draft.recordingUri?.trim()) {
      setRecordingState('stopped');
      setRecordingUri(draft.recordingUri);
      setPlaybackSource(draft.recordingUri);
      setPlaybackReady(true);
      if (draft.recordingSource === 'imported' || draft.recordingSource === 'recorded') {
        setRecordingSource(draft.recordingSource);
      }
      if (draft.durationSeconds && draft.durationSeconds > 0) {
        // publishDuration only forwards to the external onDurationChange
        // callback — it doesn't feed the `seconds` memo that actually drives
        // the on-screen timer. Without seeding priorDurationRef too, a
        // reopened draft displays 00:00 until a new segment starts.
        priorDurationRef.current = draft.durationSeconds;
        setPriorDurationSeconds(draft.durationSeconds);
        publishDuration(draft.durationSeconds);
      }
    }
    if (draft.recordingSegments?.length) {
      setRecordingSegments(draft.recordingSegments);
    }
    if (draft.transcript?.trim()) {
      // Seeds the base a resumed recording's transcript gets stitched onto —
      // without this, resuming after reopening the app would silently drop
      // everything transcribed before the restart.
      priorTranscriptRef.current = draft.transcript.trim();
      liveTranscript.updateFromUser(draft.transcript);
    }
  }, [liveTranscript, publishDuration]);

  const transcribeRecordingIfNeeded = useCallback(async (uriOverride?: string, force = false) => {
    const uri = (uriOverride || recordingUri).trim();
    if (!uri || transcript.trim().length >= 20) return;
    if (!force && transcribedUriRef.current === uri) return;
    if (transcribeInFlightRef.current) return;
    if (liveTranscript.transcriptStatus === 'transcribing') return;
    await maybeTranscribeFromServer(uri, transcript.trim(), lastTranscribeMetaRef.current, { force });
  }, [liveTranscript.transcriptStatus, maybeTranscribeFromServer, recordingUri, transcript]);

  const retryTranscription = useCallback(async () => {
    const uri = recordingUri.trim();
    if (!uri) return '';
    transcribedUriRef.current = '';
    setServerTranscribeError('');
    setServerTranscribePhase('idle');
    return maybeTranscribeFromServer(uri, '', lastTranscribeMetaRef.current, { force: true });
  }, [maybeTranscribeFromServer, recordingUri]);

  const resetRecording = useCallback(async () => {
    if (usingSpeechCapture) {
      speechCaptureRef.current.abort();
      speechCaptureRef.current.resetSession();
      clearSpeechTimer();
      setSpeechSeconds(0);
      setSpeechAudioLevel(0);
    } else {
      try {
        if (audioRecorder.isRecording) {
          await audioRecorder.stop();
        }
      } catch {
        // ignore
      }
    }
    player.pause();
    setRecordingState('idle');
    setCaptureMode(resolveSpeechCaptureMode());
    publishDuration(0);
    setRecordingUri('');
    // A real do-over, unlike continueRecording — nothing prior carries forward.
    priorTranscriptRef.current = '';
    priorDurationRef.current = 0;
    setPriorDurationSeconds(0);
    setRecordingSegments([]);
    setPlaybackSource(null);
    setPlaybackReady(false);
    transcribedUriRef.current = '';
    setServerTranscribePhase('idle');
    setServerTranscribeError('');
    liveTranscript.markIdle();
  }, [audioRecorder, clearSpeechTimer, liveTranscript, player, publishDuration, usingSpeechCapture]);

  const importRecording = useCallback(async (consent: boolean) => {
    if (!consent) {
      onErrorRef.current('Confirm that everyone agreed to the recording before importing it.');
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    onImportStartedRef.current?.();
    transcribedUriRef.current = '';
    transcribeErrorShownRef.current = false;
    setServerTranscribePhase('idle');
    setServerTranscribeError('');
    if (!isSupportedAudioImport(asset.name ?? undefined, asset.mimeType ?? undefined, asset.uri)) {
      onErrorRef.current('Unsupported format. Choose an audio file such as M4A, MP3, or WAV.');
      return;
    }
    if (asset.size && asset.size > 250 * 1024 * 1024) {
      onErrorRef.current('That recording is larger than 250 MB. Choose a shorter or compressed recording.');
      return;
    }

    const importMeta: ImportRecordingMeta = {
      fileName: asset.name ?? undefined,
      mimeType: asset.mimeType ?? undefined,
    };
    lastTranscribeMetaRef.current = importMeta;

    speechCaptureRef.current.abort();
    liveTranscript.resetForRecording();
    setRecordingState('stopped');
    setRecordingSource('imported');
    setRecordingUri(asset.uri);
    setPlaybackSource(asset.uri);
    onRecordingUriChange(asset.uri, 'imported', importMeta);
    setPlaybackReady(true);
    publishDuration(Math.max(0, Math.round(player.duration || 0)));
    onImportReadyRef.current?.();
    void maybeTranscribeFromServer(asset.uri, '', importMeta);
  }, [liveTranscript, maybeTranscribeFromServer, onRecordingUriChange, player.duration, publishDuration]);

  const playRecording = useCallback(async () => {
    if (!recordingUri) return;
    try {
      if (playbackSource !== recordingUri) {
        setPlaybackSource(recordingUri);
      }
      player.replace(recordingUri);
      player.play();
    } catch {
      onErrorRef.current('Could not play this recording on your device.');
    }
  }, [playbackSource, player, recordingUri]);

  const transcriptStatusLabel = useMemo(() => {
    switch (liveTranscript.transcriptStatus) {
      case 'receiving':
        return 'Receiving speech live';
      case 'listening':
        return usingSpeechCapture
          ? 'Listening for words…'
          : 'Recording audio…';
      case 'transcribing':
        return 'Transcribing with OpenAI…';
      case 'unavailable':
        return isExpoGo()
          ? 'Recording. Transcript appears when you tap Finish (requires sign-in)'
          : usingSpeechCapture
            ? 'Check mic and speech permissions in Settings'
            : 'Recording audio. Transcript appears when you tap Finish';
      default:
        return usingSpeechCapture
          ? 'Editable meeting record'
          : recordingState === 'recording' || recordingState === 'paused'
            ? 'Recording audio. Transcript appears when you tap Finish'
            : 'Editable meeting record';
    }
  }, [liveTranscript.transcriptStatus, recordingState, usingSpeechCapture]);

  return {
    recordingState,
    seconds,
    formattedDuration: formatDuration(seconds),
    audioLevel,
    transcriptOpen,
    setTranscriptOpen,
    transcriptStatus: liveTranscript.transcriptStatus,
    transcriptStatusLabel,
    serverTranscribePhase,
    serverTranscribeError,
    transcriptSupported: isNativeSpeechTranscriptionAvailable(),
    usesServerTranscription: isExpoGo() || captureMode === 'none',
    recordingUri,
    recordingSource,
    recordingSegments,
    recordingComplete: recordingState === 'stopped' || Boolean(recordingUri),
    playbackReady,
    isFinishing,
    displayTranscript: liveTranscript.displayTranscript,
    startRecording,
    continueRecording,
    pauseOrResume,
    stopRecording,
    awaitPendingFinish,
    resetRecording,
    importRecording,
    playRecording,
    updateTranscriptFromUser: liveTranscript.updateFromUser,
    hydrateFromDraft,
    transcribeRecordingIfNeeded,
    retryTranscription,
  };
}

export type CaptureRecorder = ReturnType<typeof useCaptureRecorder>;

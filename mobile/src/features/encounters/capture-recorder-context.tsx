import { createContext, type MutableRefObject, type PropsWithChildren, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  registerActiveCaptureController,
  updateActiveCaptureSnapshot,
} from '@/features/encounters/active-capture-controller';
import { readCaptureDraft, writeCaptureDraft } from '@/features/encounters/capture-draft';
import {
  useCaptureRecorder,
  type ImportRecordingMeta,
} from '@/features/encounters/use-capture-recorder';

type RecorderOptions = Parameters<typeof useCaptureRecorder>[0];
type CaptureRecorder = ReturnType<typeof useCaptureRecorder>;

type HandlerBridge = Omit<RecorderOptions, 'transcript'> & { encounterId: string };

const noop = () => {};
const initialHandlers: HandlerBridge = {
  encounterId: '',
  onTranscriptChange: noop,
  onDurationChange: noop,
  onRecordingUriChange: noop,
  onError: noop,
};

const CaptureRecorderContext = createContext<CaptureRecorder | null>(null);
const CaptureRecorderHandlersContext = createContext<MutableRefObject<HandlerBridge> | null>(null);

async function persistRecorderDraft(
  encounterId: string,
  changes: Record<string, unknown>,
) {
  if (!encounterId) return;
  const current = await readCaptureDraft(encounterId);
  if (!current) return;
  await writeCaptureDraft({
    ...current,
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export function CaptureRecorderProvider({ children }: PropsWithChildren) {
  const [transcript, setTranscript] = useState('');
  const handlersRef = useRef<HandlerBridge>(initialHandlers);

  const recorder = useCaptureRecorder({
    transcript,
    onTranscriptChange: (value) => {
      setTranscript(value);
      handlersRef.current.onTranscriptChange(value);
    },
    onDurationChange: (seconds) => handlersRef.current.onDurationChange(seconds),
    onRecordingUriChange: (uri, source, meta) => {
      handlersRef.current.onRecordingUriChange(uri, source, meta);
      void persistRecorderDraft(handlersRef.current.encounterId, {
        recordingUri: uri,
        recordingSegments: meta?.segments ?? [],
        recordingSource: source,
        importFileName: meta?.fileName || '',
        importMimeType: meta?.mimeType || '',
        hasLocalAudio: Boolean(uri),
        sessionStatus: 'review_ready',
        // Preserved so the review screen can tell "you tapped Finish" apart
        // from "the system cut this off" and offer Resume instead of Record
        // again for the latter.
        failureReason: meta?.interrupted ? 'recording_auto_saved_interrupted' : '',
        recordingStoppedAt: new Date().toISOString(),
      });
    },
    onError: (message) => handlersRef.current.onError(message),
    onImportReady: () => handlersRef.current.onImportReady?.(),
    onImportStarted: () => handlersRef.current.onImportStarted?.(),
    onTranscriptFinalized: (value) => {
      handlersRef.current.onTranscriptFinalized?.(value);
      void persistRecorderDraft(handlersRef.current.encounterId, { transcript: value });
    },
    transcribeFromServer: (uri, meta) => handlersRef.current.transcribeFromServer?.(uri, meta) ?? Promise.resolve(null),
  });

  const activeStatus = recorder.isFinishing
    || recorder.serverTranscribePhase === 'preparing'
    || recorder.serverTranscribePhase === 'transcribing'
    || recorder.serverTranscribePhase === 'revealing'
    ? 'processing'
    : recorder.recordingState === 'paused'
      ? 'paused'
      : recorder.recordingState === 'recording'
        ? 'recording'
        : null;

  // pauseOrResume/stopRecording aren't guaranteed stable across renders, and
  // recorder.seconds changes every tick — so reading them directly here
  // would re-run this effect (and re-register with a fresh seconds:0
  // snapshot) on every single second, producing a visible flicker back to
  // 00:00 before the real value from the effect below lands. Read them from
  // a ref instead so this only re-registers on genuine status transitions;
  // ongoing per-second updates flow through updateActiveCaptureSnapshot
  // below, which never resets seconds.
  const controlsRef = useRef({ pauseOrResume: recorder.pauseOrResume, finish: recorder.stopRecording });
  useLayoutEffect(() => {
    controlsRef.current = { pauseOrResume: recorder.pauseOrResume, finish: recorder.stopRecording };
  }, [recorder.pauseOrResume, recorder.stopRecording]);

  useEffect(() => {
    const encounterId = handlersRef.current.encounterId;
    if (!activeStatus || !encounterId) return;
    return registerActiveCaptureController({
      pauseOrResume: () => controlsRef.current.pauseOrResume(),
      finish: () => controlsRef.current.finish(),
    }, {
      encounterId,
      status: activeStatus,
      seconds: recorder.seconds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus]);

  const checkpointRef = useRef({ activeStatus, seconds: recorder.seconds });
  useLayoutEffect(() => {
    checkpointRef.current = { activeStatus, seconds: recorder.seconds };
  }, [activeStatus, recorder.seconds]);

  useEffect(() => {
    const encounterId = handlersRef.current.encounterId;
    if (!activeStatus || !encounterId) return;
    updateActiveCaptureSnapshot({ encounterId, status: activeStatus, seconds: recorder.seconds });
    if (recorder.seconds > 0 && recorder.seconds % 5 === 0) {
      void persistRecorderDraft(encounterId, {
        durationSeconds: recorder.seconds,
        sessionStatus: activeStatus,
        failureReason: '',
      });
    }
  }, [activeStatus, recorder.seconds]);

  // The 5-second interval above only fires on a whole-second boundary. A
  // background/inactive transition can land mid-interval, so force an
  // immediate checkpoint rather than risking up to 5s of unsaved recording
  // state if the OS kills the app while backgrounded.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background' && nextState !== 'inactive') return;
      const encounterId = handlersRef.current.encounterId;
      const { activeStatus: status, seconds } = checkpointRef.current;
      if (!status || !encounterId) return;
      void persistRecorderDraft(encounterId, {
        durationSeconds: seconds,
        sessionStatus: status,
        failureReason: '',
      });
    });
    return () => subscription.remove();
  }, []);

  return (
    <CaptureRecorderHandlersContext.Provider value={handlersRef}>
      <CaptureRecorderContext.Provider value={recorder}>
        {children}
      </CaptureRecorderContext.Provider>
    </CaptureRecorderHandlersContext.Provider>
  );
}

export function useSharedCaptureRecorder(options: RecorderOptions, encounterId: string) {
  const recorder = useContext(CaptureRecorderContext);
  const handlersRef = useContext(CaptureRecorderHandlersContext);

  if (!recorder || !handlersRef) {
    throw new Error('useSharedCaptureRecorder must be used inside CaptureRecorderProvider.');
  }

  useLayoutEffect(() => {
    handlersRef.current = {
      encounterId,
      onTranscriptChange: options.onTranscriptChange,
      onDurationChange: options.onDurationChange,
      onRecordingUriChange: options.onRecordingUriChange,
      onError: options.onError,
      onImportReady: options.onImportReady,
      onImportStarted: options.onImportStarted,
      onTranscriptFinalized: options.onTranscriptFinalized,
      transcribeFromServer: options.transcribeFromServer,
    };
  }, [
    encounterId,
    handlersRef,
    options.onDurationChange,
    options.onError,
    options.onImportReady,
    options.onImportStarted,
    options.onRecordingUriChange,
    options.onTranscriptChange,
    options.onTranscriptFinalized,
    options.transcribeFromServer,
  ]);

  return recorder;
}

export type { CaptureRecorder, ImportRecordingMeta };

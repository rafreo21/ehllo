import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';

import { joinSpeechResults } from '@/lib/live-transcript-merge';

type SpeechResultEvent = {
  isFinal: boolean;
  results: Array<{ transcript: string }>;
};

type SpeechErrorEvent = {
  error: string;
  message?: string;
};

type SpeechVolumeEvent = {
  value: number;
};

type SpeechAudioEvent = {
  uri: string | null;
};

type SpeechModule = {
  isRecognitionAvailable: () => boolean;
  supportsRecording?: () => boolean;
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean; status?: string }>;
  requestMicrophonePermissionsAsync?: () => Promise<{ granted: boolean }>;
  requestSpeechRecognizerPermissionsAsync?: () => Promise<{ granted: boolean }>;
  getDefaultRecognitionService?: () => { packageName: string };
  getSpeechRecognitionServices?: () => string[];
  addListener: (
    eventName: string,
    listener: (event: unknown) => void,
  ) => { remove: () => void };
};

const speechModule = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');

const FATAL_SPEECH_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'language-not-supported',
  'audio-capture',
]);

export type SpeechCaptureMode = 'unified' | 'transcript-only' | 'none';

export function isNativeSpeechTranscriptionAvailable() {
  return Boolean(speechModule?.isRecognitionAvailable?.());
}

export function supportsNativeSpeechRecording() {
  return Boolean(speechModule?.supportsRecording?.());
}

/**
 * Record always needs a durable on-device file (playback + guest share).
 * Speech-module "recording" is unreliable on many Androids (live words, no WAV),
 * so capture recording uses expo-audio only. Transcript comes from OpenAI Whisper on Finish.
 * Live on-device STT can return later on devices we have verified write audio.
 */
export function resolveSpeechCaptureMode(): SpeechCaptureMode {
  return 'none';
}

/** Kept for diagnostics / future dual-path experiments. */
export function shouldUseUnifiedSpeechCapture() {
  return false;
}

function joinRecordingPath(directory: string, fileName: string) {
  const base = directory.endsWith('/') ? directory : `${directory}/`;
  return `${base}${fileName}`;
}

async function fileExists(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

async function findLatestCaptureAudio(directory: string) {
  try {
    const base = directory.endsWith('/') ? directory : `${directory}/`;
    const entries = await FileSystem.readDirectoryAsync(base);
    const captures = entries
      .filter((name) => /^capture-\d+\.(wav|m4a|mp3|aac|caf)$/i.test(name))
      .sort();
    const latest = captures[captures.length - 1];
    if (!latest) return null;
    const uri = `${base}${latest}`;
    return (await fileExists(uri)) ? uri : null;
  } catch {
    return null;
  }
}

function normalizeVolume(value: number) {
  // Android/iOS emit roughly -2..10; map inaudible values to 0.
  return Math.min(1, Math.max(0, (value + 2) / 12));
}

function resolveRecognitionLanguage() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale) return locale;
  } catch {
    // ignore
  }
  return 'en-GB';
}

function resolveAndroidRecognitionService(): string | undefined {
  if (Platform.OS !== 'android' || !speechModule) return undefined;

  const available = speechModule.getSpeechRecognitionServices?.() ?? [];
  if (!available.length) {
    // Let Android pick the default recognizer when manifest queries are unavailable.
    return undefined;
  }

  const availableSet = new Set(available);
  const candidates = [
    speechModule.getDefaultRecognitionService?.()?.packageName,
    'com.google.android.tts',
    'com.google.android.as',
    'com.google.android.googlequicksearchbox',
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    if (availableSet.has(candidate)) return candidate;
  }

  return available[0];
}

export class NativeSpeechCapture {
  private subscriptions: Array<{ remove: () => void }> = [];
  private active = false;
  private recordingUri: string | null = null;
  private recordingDone: (() => void) | null = null;
  private persistRecording = true;
  private androidServicePackage: string | undefined;
  private sessionOutputFileName: string | null = null;
  private outputDirectory = '';
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  isAvailable(mode: SpeechCaptureMode = resolveSpeechCaptureMode()) {
    return mode !== 'none';
  }

  async start({
    mode = resolveSpeechCaptureMode(),
    outputDirectory,
    onResult,
    onVolume,
    onListening,
    onSegmentEnd,
    onError,
    onUnavailable,
  }: {
    mode?: SpeechCaptureMode;
    outputDirectory: string;
    onResult: (text: string, isFinal: boolean) => void;
    onVolume?: (level: number) => void;
    onListening?: () => void;
    onSegmentEnd?: () => void;
    onError?: (message: string) => void;
    onUnavailable: () => void;
  }): Promise<boolean> {
    if (mode === 'none' || !speechModule) {
      onUnavailable();
      return false;
    }

    try {
      const micPermission = await (speechModule.requestMicrophonePermissionsAsync?.()
        ?? speechModule.requestPermissionsAsync());
      const speechPermission = await (speechModule.requestSpeechRecognizerPermissionsAsync?.()
        ?? Promise.resolve({ granted: true }));
      const permission = await speechModule.requestPermissionsAsync();
      const granted =
        permission.granted &&
        (micPermission?.granted ?? true) &&
        (speechPermission?.granted ?? true);
      if (!granted) {
        onError?.('Microphone or speech recognition permission was not granted.');
        onUnavailable();
        return false;
      }

      this.cleanup();
      this.active = true;
      this.recordingUri = null;
      this.persistRecording = mode === 'unified';
      this.androidServicePackage = resolveAndroidRecognitionService();
      this.outputDirectory = outputDirectory;
      if (!this.sessionOutputFileName) {
        this.sessionOutputFileName = `capture-${Date.now()}.wav`;
      }

      this.subscriptions.push(
        speechModule.addListener('result', (event) => {
          const payload = event as SpeechResultEvent;
          const text = joinSpeechResults(payload?.results);
          if (!text) return;
          onResult(text, payload.isFinal);
        }),
      );

      this.subscriptions.push(
        speechModule.addListener('speechend', () => {
          onSegmentEnd?.();
        }),
      );

      this.subscriptions.push(
        speechModule.addListener('volumechange', (event) => {
          const payload = event as SpeechVolumeEvent;
          if (typeof payload?.value === 'number') {
            onVolume?.(normalizeVolume(payload.value));
          }
        }),
      );

      this.subscriptions.push(
        speechModule.addListener('start', () => {
          onListening?.();
        }),
      );

      this.subscriptions.push(
        speechModule.addListener('speechstart', () => {
          onListening?.();
        }),
      );

      this.subscriptions.push(
        speechModule.addListener('error', (event) => {
          const payload = event as SpeechErrorEvent;
          if (!payload?.error) return;
          if (FATAL_SPEECH_ERRORS.has(payload.error)) {
            onError?.(payload.message?.trim() || 'Speech recognition is unavailable on this device.');
            onUnavailable();
          }
        }),
      );

      this.subscriptions.push(
        speechModule.addListener('audioend', (event) => {
          const payload = event as SpeechAudioEvent;
          if (payload?.uri) this.recordingUri = payload.uri;
          this.recordingDone?.();
        }),
      );

      this.subscriptions.push(
        speechModule.addListener('end', () => {
          if (!this.active || !speechModule) return;
          onSegmentEnd?.();
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            if (!this.active || !speechModule) return;
            try {
              speechModule.start(this.buildStartOptions());
            } catch {
              // ignore restart failures
            }
          }, 200);
        }),
      );

      speechModule.start(this.buildStartOptions());
      return true;
    } catch (error) {
      this.active = false;
      onError?.(error instanceof Error ? error.message : 'Could not start live transcription.');
      onUnavailable();
      return false;
    }
  }

  private buildStartOptions() {
    // Persisted audio uses silence-based segmentation so Android keeps one session
    // across natural pauses instead of tearing down the mic stream after each phrase.
    const continuous = !this.persistRecording;

    const options: Record<string, unknown> = {
      lang: resolveRecognitionLanguage(),
      interimResults: true,
      continuous,
      addsPunctuation: true,
      maxAlternatives: 1,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
      contextualStrings: [
        'action items',
        'next steps',
        'follow up',
        'meeting notes',
        'agreed',
        'deadline',
        'Ehllo',
      ],
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'free_form',
        ...(this.persistRecording
          ? {
              EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
              EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 500,
              EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
            }
          : {}),
      },
    };

    if (Platform.OS === 'android' && this.androidServicePackage) {
      options.androidRecognitionServicePackage = this.androidServicePackage;
    }

    if (this.persistRecording) {
      options.recordingOptions = {
        persist: true,
        outputDirectory: this.outputDirectory,
        outputFileName: this.sessionOutputFileName ?? `capture-${Date.now()}.wav`,
      };
    }

    return options;
  }

  async stop(): Promise<string | null> {
    this.active = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!speechModule) return null;

    const expectedUri =
      this.persistRecording && this.outputDirectory && this.sessionOutputFileName
        ? joinRecordingPath(this.outputDirectory, this.sessionOutputFileName)
        : null;

    const waitForAudio = new Promise<string | null>((resolve) => {
      if (!this.persistRecording) {
        resolve(null);
        return;
      }
      if (this.recordingUri) {
        resolve(this.recordingUri);
        return;
      }
      this.recordingDone = () => resolve(this.recordingUri);
      setTimeout(() => resolve(this.recordingUri), 3500);
    });

    try {
      speechModule.stop();
    } catch {
      // ignore
    }

    let uri = await waitForAudio;

    if ((!uri || !(await fileExists(uri))) && expectedUri && (await fileExists(expectedUri))) {
      uri = expectedUri;
    }
    if (!uri && this.persistRecording && this.outputDirectory) {
      uri = await findLatestCaptureAudio(this.outputDirectory);
    }

    this.cleanup();
    return uri;
  }

  abort() {
    this.active = false;
    try {
      speechModule?.abort();
    } catch {
      // ignore
    }
    this.cleanup();
  }

  cleanup() {
    this.recordingDone = null;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    for (const subscription of this.subscriptions) {
      subscription.remove();
    }
    this.subscriptions = [];
  }

  resetSession() {
    this.sessionOutputFileName = null;
  }
}

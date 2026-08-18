import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AudioRetention } from '@/features/encounters/local-recordings';
import {
  migrateGatherPeople,
  syncLegacyPersonFields,
  type GatherPerson,
} from '@/features/encounters/gather-people';
import type { FollowUpChannel } from '@/features/follow-ups/follow-up-channels';
import { isFollowUpChannel } from '@/features/follow-ups/follow-up-channels';
import type { CaptureSessionStatus } from '@/features/encounters/capture-session-state';
import type { RemoteCaptureSession } from '@/features/encounters/encounter-api';

export type { GatherPerson };
export { MAX_GATHER_PEOPLE } from '@/features/encounters/gather-people';

export type ManualFollowUpDraft = {
  id: string;
  title: string;
  channel: FollowUpChannel;
  owner: 'me' | 'guest';
  targetPersonId: string;
  dueAt: string;
};

export type CaptureWizardDraft = {
  step: number;
  encounterId: string;
  captureMode: 'recording' | 'quick_context';
  sessionStatus: CaptureSessionStatus;
  failureReason: string;
  recordingStartedAt: string;
  recordingStoppedAt: string;
  consent: boolean;
  consentMethod: 'verbal' | 'written';
  durationSeconds: number;
  recordingUri: string;
  /**
   * Prior takes from before an interruption forced a new file - `recordingUri`
   * is always the latest/current segment. Stitched into one file at save
   * time (see audio-segment-stitch.ts) so upload/playback code downstream
   * never needs to know a recording was ever split.
   */
  recordingSegments: string[];
  recordingSource: 'recorded' | 'imported' | '';
  retention: AudioRetention;
  people: GatherPerson[];
  personName: string;
  personEmail: string;
  personPhone: string;
  personLinkedIn: string;
  personAcknowledged: boolean;
  contactId: string;
  exchangeId: string;
  transcript: string;
  title: string;
  privateNotes: string;
  sharedSummary: string;
  manualFollowUps: ManualFollowUpDraft[];
  gatherSessionStartedAt: string;
  importFileName: string;
  importMimeType: string;
  updatedAt: string;
  originDeviceId: string;
  originDeviceLabel: string;
  hasLocalAudio: boolean;
  /** Audio exists locally but there's no usable server transcript yet. */
  transcriptPending: boolean;
  transcriptPendingError: string;
};

export type CaptureDraftSummary = {
  encounterId: string;
  updatedAt: string;
  step: number;
  personName: string;
  title: string;
  transcriptPreview: string;
  sessionStatus: CaptureSessionStatus;
  failureReason: string;
  hasLocalAudio: boolean;
  transcriptPending: boolean;
};

export const CAPTURE_DRAFT_KEY = 'aftermeet-capture-wizard-v1';
export const CAPTURE_DRAFTS_INDEX_KEY = 'aftermeet-capture-drafts-index-v2';
export const AUTH_RETURN_KEY = 'aftermeet-auth-return-v1';
const CAPTURE_DEVICE_ID_KEY = 'aftermeet-capture-device-id-v1';

function createEncounterId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function draftStorageKey(encounterId: string) {
  return `aftermeet-capture-draft-${encounterId}`;
}

function migrateCaptureStep(step: number) {
  // Old 4-step wizard: 0=Record, 1=Gather, 2=Context, 3=Follow-up
  // Current 3-step: 0=Interaction, 1=Context, 2=Follow-up
  if (step <= 0) return 0;
  if (step === 1) return 0;
  if (step === 2) return 1;
  return 2;
}

function normalizeSessionStatus(parsed: Partial<CaptureWizardDraft>): CaptureSessionStatus {
  const status = parsed.sessionStatus;
  if (
    status === 'draft'
    || status === 'recording'
    || status === 'paused'
    || status === 'processing'
    || status === 'review_ready'
    || status === 'saved'
    || status === 'failed'
  ) {
    return status;
  }
  return parsed.recordingUri?.trim() ? 'review_ready' : 'draft';
}

function normalizeManualFollowUps(value: unknown): ManualFollowUpDraft[] {
  if (!Array.isArray(value)) return [];
  const next: ManualFollowUpDraft[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<ManualFollowUpDraft>;
    if (typeof item.id !== 'string' || !item.id) continue;
    next.push({
      id: item.id,
      title: typeof item.title === 'string' ? item.title : '',
      channel: typeof item.channel === 'string' && isFollowUpChannel(item.channel) ? item.channel : 'email',
      owner: item.owner === 'guest' ? 'guest' : 'me',
      targetPersonId: typeof item.targetPersonId === 'string' ? item.targetPersonId : '',
      dueAt: typeof item.dueAt === 'string' ? item.dueAt : '',
    });
  }
  return next;
}

function normalizeDraft(parsed: Partial<CaptureWizardDraft>): CaptureWizardDraft {
  const people = migrateGatherPeople(parsed);
  const synced = syncLegacyPersonFields(people);
  const rawStep = typeof parsed.step === 'number' ? parsed.step : 0;
  return {
    ...EMPTY_CAPTURE_DRAFT,
    ...parsed,
    ...synced,
    people: synced.people ?? [],
    encounterId: parsed.encounterId || createEncounterId(),
    updatedAt: parsed.updatedAt || new Date().toISOString(),
    gatherSessionStartedAt: parsed.gatherSessionStartedAt || '',
    step: migrateCaptureStep(rawStep),
    captureMode: parsed.captureMode === 'quick_context' ? 'quick_context' : 'recording',
    sessionStatus: normalizeSessionStatus(parsed),
    failureReason: typeof parsed.failureReason === 'string' ? parsed.failureReason : '',
    recordingStartedAt: typeof parsed.recordingStartedAt === 'string' ? parsed.recordingStartedAt : '',
    recordingStoppedAt: typeof parsed.recordingStoppedAt === 'string' ? parsed.recordingStoppedAt : '',
    recordingSegments: Array.isArray(parsed.recordingSegments)
      ? parsed.recordingSegments.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    privateNotes: typeof parsed.privateNotes === 'string' ? parsed.privateNotes : '',
    manualFollowUps: normalizeManualFollowUps(parsed.manualFollowUps),
    transcriptPending: Boolean(parsed.transcriptPending),
    transcriptPendingError: typeof parsed.transcriptPendingError === 'string' ? parsed.transcriptPendingError : '',
  };
}

function toSummary(draft: CaptureWizardDraft): CaptureDraftSummary {
  return {
    encounterId: draft.encounterId,
    updatedAt: draft.updatedAt,
    step: draft.step,
    personName: draft.personName.trim(),
    title: draft.title.trim(),
    transcriptPreview: draft.transcript.trim().slice(0, 120),
    sessionStatus: draft.sessionStatus,
    failureReason: draft.failureReason,
    hasLocalAudio: draft.hasLocalAudio || Boolean(draft.recordingUri.trim()),
    transcriptPending: draft.transcriptPending,
  };
}

export const EMPTY_CAPTURE_DRAFT: CaptureWizardDraft = {
  step: 0,
  encounterId: createEncounterId(),
  captureMode: 'recording',
  sessionStatus: 'draft',
  failureReason: '',
  recordingStartedAt: '',
  recordingStoppedAt: '',
  consent: false,
  consentMethod: 'verbal',
  durationSeconds: 0,
  recordingUri: '',
  recordingSegments: [],
  recordingSource: '',
  retention: '7_days',
  people: [],
  personName: '',
  personEmail: '',
  personPhone: '',
  personLinkedIn: '',
  personAcknowledged: false,
  contactId: '',
  exchangeId: '',
  transcript: '',
  title: '',
  privateNotes: '',
  sharedSummary: '',
  manualFollowUps: [],
  gatherSessionStartedAt: '',
  importFileName: '',
  importMimeType: '',
  updatedAt: new Date().toISOString(),
  originDeviceId: '',
  originDeviceLabel: '',
  hasLocalAudio: false,
  transcriptPending: false,
  transcriptPendingError: '',
};

export function createFreshCaptureDraft(): CaptureWizardDraft {
  const now = new Date().toISOString();
  return {
    ...EMPTY_CAPTURE_DRAFT,
    encounterId: createEncounterId(),
    gatherSessionStartedAt: now,
    updatedAt: now,
  };
}

export async function getCaptureDeviceIdentity() {
  let id = await AsyncStorage.getItem(CAPTURE_DEVICE_ID_KEY);
  if (!id) {
    id = createEncounterId();
    await AsyncStorage.setItem(CAPTURE_DEVICE_ID_KEY, id);
  }
  return { id, label: 'Mobile device' };
}

async function readDraftIndex(): Promise<CaptureDraftSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(CAPTURE_DRAFTS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CaptureDraftSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeDraftIndex(entries: CaptureDraftSummary[]) {
  const sorted = [...entries].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  await AsyncStorage.setItem(CAPTURE_DRAFTS_INDEX_KEY, JSON.stringify(sorted));
}

async function migrateLegacyDraftIfNeeded() {
  const legacyRaw = await AsyncStorage.getItem(CAPTURE_DRAFT_KEY);
  if (!legacyRaw) return;

  try {
    const parsed = JSON.parse(legacyRaw) as Partial<CaptureWizardDraft>;
    const draft = normalizeDraft(parsed);
    if (hasCaptureDraftProgress(draft)) {
      await AsyncStorage.setItem(draftStorageKey(draft.encounterId), JSON.stringify(draft));
      const index = await readDraftIndex();
      const next = index.filter((item) => item.encounterId !== draft.encounterId);
      next.unshift(toSummary(draft));
      await writeDraftIndex(next);
    }
  } catch {
    // ignore corrupt legacy draft
  }

  await AsyncStorage.removeItem(CAPTURE_DRAFT_KEY);
}

export async function listCaptureDrafts(): Promise<CaptureDraftSummary[]> {
  await migrateLegacyDraftIfNeeded();
  const index = await readDraftIndex();
  const valid: CaptureDraftSummary[] = [];

  for (const entry of index) {
    const raw = await AsyncStorage.getItem(draftStorageKey(entry.encounterId));
    if (!raw) continue;
    try {
      const draft = normalizeDraft(JSON.parse(raw) as Partial<CaptureWizardDraft>);
      if (!hasCaptureDraftProgress(draft)) continue;
      valid.push(toSummary(draft));
    } catch {
      // ignore corrupt draft
    }
  }

  if (valid.length !== index.length) {
    await writeDraftIndex(valid);
  }

  return valid;
}

export async function readCaptureDraft(encounterId?: string): Promise<CaptureWizardDraft | null> {
  await migrateLegacyDraftIfNeeded();

  if (encounterId) {
    const raw = await AsyncStorage.getItem(draftStorageKey(encounterId));
    if (!raw) return null;
    try {
      return normalizeDraft(JSON.parse(raw) as Partial<CaptureWizardDraft>);
    } catch {
      return null;
    }
  }

  const drafts = await listCaptureDrafts();
  if (!drafts[0]) return null;
  return readCaptureDraft(drafts[0].encounterId);
}

export async function writeCaptureDraft(draft: CaptureWizardDraft) {
  const next = normalizeDraft({
    ...draft,
    updatedAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(draftStorageKey(next.encounterId), JSON.stringify(next));

  const index = await readDraftIndex();
  const filtered = index.filter((item) => item.encounterId !== next.encounterId);
  if (hasCaptureDraftProgress(next)) {
    filtered.unshift(toSummary(next));
  }
  await writeDraftIndex(filtered);
}

export function captureDraftFromRemote(session: RemoteCaptureSession): CaptureWizardDraft {
  return normalizeDraft({
    ...(session as Partial<CaptureWizardDraft>),
    encounterId: session.encounterId,
    recordingUri: '',
    recordingSegments: [],
    recordingSource: '',
    originDeviceId: typeof session.deviceId === 'string' ? session.deviceId : '',
    originDeviceLabel: typeof session.deviceLabel === 'string' ? session.deviceLabel : '',
    hasLocalAudio: Boolean(session.hasLocalAudio),
  });
}

export function captureDraftToRemote(
  draft: CaptureWizardDraft,
  device: { id: string; label: string },
): RemoteCaptureSession {
  const { recordingUri, recordingSegments, transcriptPending, transcriptPendingError, ...safeDraft } = draft;
  void recordingUri;
  void recordingSegments;
  void transcriptPending;
  void transcriptPendingError;
  return {
    ...safeDraft,
    encounterId: draft.encounterId,
    sessionStatus: draft.sessionStatus === 'saved' ? 'review_ready' : draft.sessionStatus,
    durationSeconds: draft.durationSeconds,
    deviceId: device.id,
    deviceLabel: device.label,
    hasLocalAudio: Boolean(draft.recordingUri),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A draft can end up stuck showing `sessionStatus: 'recording'|'paused'`
 * with no in-memory session actually backing it (app was killed, or the
 * interruption watchdog never got a chance to run) - the persisted status
 * never got a chance to reconcile. Left as-is, it looks like a phantom still
 * -live recording indefinitely. Call this for any draft NOT covered by the
 * live in-memory `activeCaptureController` before treating it as stale.
 */
export async function reconcileStaleLiveDraft(encounterId: string) {
  const draft = await readCaptureDraft(encounterId);
  if (!draft) return null;
  if ((draft.sessionStatus === 'recording' || draft.sessionStatus === 'paused') && !draft.recordingUri.trim()) {
    const reconciled: CaptureWizardDraft = {
      ...draft,
      sessionStatus: 'failed',
      failureReason: 'recording_interrupted',
      recordingStoppedAt: new Date().toISOString(),
    };
    await writeCaptureDraft(reconciled);
    return reconciled;
  }
  return draft;
}

export async function deleteCaptureDraft(encounterId: string) {
  await AsyncStorage.removeItem(draftStorageKey(encounterId));
  const index = await readDraftIndex();
  await writeDraftIndex(index.filter((item) => item.encounterId !== encounterId));
}

export async function clearCaptureDraft(encounterId?: string) {
  if (encounterId) {
    await deleteCaptureDraft(encounterId);
    return;
  }
  const drafts = await listCaptureDrafts();
  await Promise.all(drafts.map((draft) => deleteCaptureDraft(draft.encounterId)));
}

export function hasCaptureDraftProgress(draft: CaptureWizardDraft) {
  return draft.step > 0
    || draft.consent
    || draft.transcript.trim().length > 0
    || draft.recordingUri.trim().length > 0
    || draft.people.length > 0
    || draft.title.trim().length > 0
    || draft.sharedSummary.trim().length > 0
    || draft.manualFollowUps.length > 0;
}

export async function setAuthReturnPath(path: string) {
  await AsyncStorage.setItem(AUTH_RETURN_KEY, path);
}

export async function consumeAuthReturnPath() {
  const path = await AsyncStorage.getItem(AUTH_RETURN_KEY);
  await AsyncStorage.removeItem(AUTH_RETURN_KEY);
  return path;
}

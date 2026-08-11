import { File } from 'expo-file-system';

import {
  MAX_BASE64_TRANSCRIBE_BYTES,
  guessRecordingFileName,
  prepareAudioFile,
  prepareAudioUpload,
  type PreparedAudioUpload,
} from '@/features/encounters/audio-upload';
import type { LocalRecordingMetadata } from '@/features/encounters/local-recordings';
import { mobileFetch, readMobileApiJson } from '@/lib/mobile-api';
import { requestFollowUpNotificationSync } from '@/features/notifications/notification-sync-events';
import {
  displayFollowUpTitle,
  type FollowUpChannel,
} from '@/features/follow-ups/follow-up-channels';

// Longer than mobileFetch's default — transcribing a long recording
// genuinely takes a while server-side, and this is the one call site where
// the default 45s would fire false-positive timeouts on real, still-working
// requests.
const TRANSCRIBE_TIMEOUT_MS = 240_000;

export type FollowUpChannelId = FollowUpChannel;

export type EncounterDraft = {
  title: string;
  personName: string;
  sharedSummary: string;
  privateNotes: string;
  followUp: string;
  followUpType: FollowUpChannelId;
  commitments?: EncounterExtractionCommitment[];
};

export type EncounterExtractionCommitment = {
  title: string;
  owner: 'me' | 'guest';
  ownerName: string;
  channel: FollowUpChannelId;
  dueAt: string;
};

export type EncounterAction = {
  id: string;
  title: string;
  channel: FollowUpChannelId;
  owner: 'me' | 'guest';
  dueAt: string;
  status: 'proposed' | 'open' | 'snoozed' | 'completed' | 'dismissed' | 'cancelled';
  completedAt?: string;
  snoozedUntil?: string;
  dismissedAt?: string;
  cancelledAt?: string;
  statusUpdatedAt?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  participantId?: string;
  groupId?: string;
  outboundDraft?: OutboundDraft;
};

export type OutboundDraft = {
  subject: string;
  body: string;
  status: 'proposed' | 'approved' | 'sent' | 'dismissed';
  source: 'ai' | 'heuristic' | 'manual';
  generatedAt: string;
  approvedAt?: string;
  sentAt?: string;
};

export type GuestFollowUp = {
  id?: string;
  participantId?: string;
  guestName?: string;
  guestEmail?: string;
  committedAt: string;
  note?: string;
  channel?: FollowUpChannelId;
  dueAt?: string;
};

export type EncounterParticipant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  linkedIn: string;
  exchangeId?: string;
};

export type EncounterPayload = {
  id: string;
  title: string;
  personName: string;
  personEmail: string;
  contactId?: string;
  exchangeId?: string;
  campaignId?: string;
  /** The event this meeting happened at, if any — see events-api.ts. Optional context, never required. */
  eventId?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  consent: {
    confirmed: boolean;
    method: 'verbal' | 'written';
    confirmedAt: string;
    scriptVersion: '2026-07-26';
  };
  transcript: string;
  privateNotes: string;
  sharedSummary: string;
  actions: EncounterAction[];
  participants: EncounterParticipant[];
  status: 'draft' | 'reviewed' | 'shared' | 'archived';
  shareToken: string;
  recording?: LocalRecordingMetadata;
  guestFollowUp?: GuestFollowUp;
  guestFollowUps?: GuestFollowUp[];
  /** Server's last-write timestamp, used for optimistic-concurrency checks on save. Absent for local-only/never-synced encounters. */
  updatedAt?: string;
};

export class EncounterConflictError extends Error {
  serverUpdatedAt?: string;
  constructor(message: string, serverUpdatedAt?: string) {
    super(message);
    this.name = 'EncounterConflictError';
    this.serverUpdatedAt = serverUpdatedAt;
  }
}

export type InboundExchange = {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
  visitor_company: string;
  visitor_role: string;
  note: string;
  status?: string;
  created_at?: string;
};

function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export type EncounterSummary = {
  id: string;
  title: string;
  personName: string;
  sharedSummary: string;
  privateNotes: string;
  followUp: string;
  followUpType: EncounterDraft['followUpType'];
  status: EncounterPayload['status'];
  startedAt: string;
  endedAt: string;
};

function mapEncounterSummary(row: Record<string, unknown>): EncounterSummary {
  const actions = Array.isArray(row.actions) ? row.actions as EncounterAction[] : [];
  const followUp = actions[0];
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    personName: String(row.person_name ?? row.personName ?? ''),
    sharedSummary: String(row.shared_summary ?? row.sharedSummary ?? ''),
    privateNotes: String(row.private_notes ?? row.privateNotes ?? ''),
    followUp: followUp?.title ?? '',
    followUpType: followUp?.channel ?? 'other',
    status: (row.status as EncounterPayload['status']) ?? 'draft',
    startedAt: String(row.started_at ?? row.startedAt ?? ''),
    endedAt: String(row.ended_at ?? row.endedAt ?? ''),
  };
}

export async function fetchEncounters(accessToken: string) {
  const response = await mobileFetch('/api/encounters', accessToken);
  const payload = await readMobileApiJson<{ encounters?: Array<Record<string, unknown>>; error?: string; preview?: boolean }>(
    response,
    'Could not read your captures from AfterMeet.',
  );
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load your captures.');
  }
  return (payload.encounters ?? []).map(mapEncounterSummary);
}

export type RemoteCaptureSession = {
  encounterId: string;
  sessionStatus: 'draft' | 'recording' | 'paused' | 'processing' | 'review_ready' | 'failed';
  step: number;
  durationSeconds: number;
  deviceId?: string;
  deviceLabel?: string;
  updatedAt: string;
  failureReason?: string;
  [key: string]: unknown;
};

export class CaptureSessionConflictError extends Error {
  currentStatus?: string;

  constructor(message: string, currentStatus?: string) {
    super(message);
    this.name = 'CaptureSessionConflictError';
    this.currentStatus = currentStatus;
  }
}

export async function fetchCaptureSessions(accessToken: string) {
  const response = await mobileFetch('/api/capture-sessions', accessToken);
  const payload = await readMobileApiJson<{ sessions?: RemoteCaptureSession[]; error?: string }>(
    response,
    'Could not read active captures from AfterMeet.',
  );
  if (!response.ok) throw new Error(payload.error || 'Could not load active captures.');
  return payload.sessions ?? [];
}

export async function syncCaptureSession(accessToken: string, snapshot: RemoteCaptureSession) {
  const response = await mobileFetch('/api/capture-sessions', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string; currentStatus?: string }>(
    response,
    'Could not sync this capture with AfterMeet.',
  );
  if (response.status === 409) {
    throw new CaptureSessionConflictError(
      payload.error || 'This capture changed on another device.',
      payload.currentStatus,
    );
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not sync this capture.');
}

export async function extractEncounterDraft(
  accessToken: string,
  transcript: string,
  hints?: {
    personName?: string;
    personEmail?: string;
    personPhone?: string;
    people?: Array<{ name: string; email?: string; phone?: string }>;
  },
) {
  const response = await mobileFetch('/api/encounters/extract', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      personName: hints?.personName?.trim() || '',
      personEmail: hints?.personEmail?.trim() || '',
      personPhone: hints?.personPhone?.trim() || '',
      people: hints?.people ?? [],
    }),
  });
  const payload = await readMobileApiJson<{
    draft?: EncounterDraft;
    source?: 'ai' | 'heuristic';
    uncertainFields?: string[];
    error?: string;
  }>(response, 'Could not read the suggested meeting context.');
  if (!response.ok || !payload.draft) {
    throw new Error(payload.error || 'Could not suggest meeting context.');
  }
  return payload;
}

export async function fetchInboundExchanges(accessToken: string) {
  const response = await mobileFetch('/api/cards/exchanges', accessToken);
  const payload = await readMobileApiJson<{ exchanges?: InboundExchange[]; error?: string }>(
    response,
    'Could not read inbound captures from AfterMeet.',
  );
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load inbound captures.');
  }
  return payload.exchanges ?? [];
}

export function buildEncounterPayload(input: {
  id?: string;
  transcript: string;
  title: string;
  personName: string;
  personEmail?: string;
  people?: Array<{ id?: string; name: string; email?: string; phone?: string; linkedIn?: string; exchangeId?: string }>;
  contactId?: string;
  exchangeId?: string;
  campaignId?: string;
  sharedSummary: string;
  privateNotes: string;
  manualFollowUps?: Array<{
    title: string;
    channel: FollowUpChannel;
    owner: 'me' | 'guest';
    targetPersonId: string;
    dueAt: string;
  }>;
  commitments?: EncounterExtractionCommitment[];
  consentMethod?: 'verbal' | 'written';
  consentConfirmed?: boolean;
  status?: EncounterPayload['status'];
  shareToken?: string;
  durationSeconds?: number;
  startedAt?: string;
  recording?: LocalRecordingMetadata;
}): EncounterPayload {
  const now = new Date().toISOString();
  const encounterStatus = input.status || 'draft';
  const actionStatus: EncounterAction['status'] = encounterStatus === 'draft' ? 'proposed' : 'open';
  const durationSeconds = Math.max(0, Math.round(input.durationSeconds ?? 0));
  const startedAt = input.startedAt || new Date(Date.now() - durationSeconds * 1000).toISOString();
  const meetingPeople: EncounterParticipant[] = (input.people ?? [])
    .map((person) => ({
      id: person.id || createId(),
      name: person.name.trim(),
      email: person.email?.trim() ?? '',
      phone: person.phone?.trim() ?? '',
      linkedIn: person.linkedIn?.trim() ?? '',
      exchangeId: person.exchangeId || undefined,
    }))
    .filter((person) => person.name.length >= 2);

  const assignees = meetingPeople.length >= 1
    ? meetingPeople
    : [{
        id: createId(),
        name: input.personName.trim(),
        email: input.personEmail?.trim() ?? '',
        phone: '',
        linkedIn: '',
        exchangeId: input.exchangeId || undefined,
      }];

  const selectedCommitments = (input.commitments ?? []).filter((commitment) => commitment.title.trim());
  const actions: EncounterAction[] = [];
  // Every follow-up targeting the same person in this capture shares a
  // groupId, so the follow-ups list nests them under one person instead of
  // showing a separate top-level row per follow-up.
  const groupIdsByPerson = new Map<string, string>();
  function groupIdFor(personId: string) {
    const existing = groupIdsByPerson.get(personId);
    if (existing) return existing;
    const next = createId();
    groupIdsByPerson.set(personId, next);
    return next;
  }
  for (const commitment of selectedCommitments) {
    const assignee = assignees.find((person) => (
      person.name.trim().toLocaleLowerCase() === commitment.ownerName.trim().toLocaleLowerCase()
    )) ?? assignees[0];
    if (!assignee?.name.trim()) continue;
    actions.push({
      id: createId(),
      title: commitment.title.trim(),
      channel: commitment.channel,
      owner: commitment.owner,
      dueAt: commitment.dueAt.trim(),
      status: actionStatus,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
      participantId: assignee.id,
      groupId: groupIdFor(assignee.id),
    });
  }
  for (const item of input.manualFollowUps ?? []) {
    const title = item.title?.trim() ?? '';
    const sanitizedTitle = title && !/^[\d+\s()-]+$/.test(title) ? title : '';
    const owner: 'me' | 'guest' = item.owner === 'guest' ? 'guest' : 'me';
    const assignee = assignees.find((person) => person.id === item.targetPersonId) ?? assignees[0];
    if (!assignee?.name.trim()) continue;
    const displayTitle = displayFollowUpTitle(sanitizedTitle, item.channel);
    const duplicatesSuggestion = selectedCommitments.some((commitment) => (
      commitment.title.trim().toLocaleLowerCase() === displayTitle.toLocaleLowerCase()
      && commitment.channel === item.channel
    ));
    if (duplicatesSuggestion) continue;
    actions.push({
      id: createId(),
      title: displayTitle,
      channel: item.channel,
      owner,
      dueAt: item.dueAt?.trim() || '',
      status: actionStatus,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
      participantId: assignee.id,
      groupId: groupIdFor(assignee.id),
    });
  }

  return {
    id: input.id || createId(),
    title: input.title.trim() || `Meeting with ${input.personName.trim() || 'someone new'}`,
    personName: input.personName.trim(),
    personEmail: input.personEmail?.trim() || '',
    contactId: input.contactId || undefined,
    exchangeId: input.exchangeId || undefined,
    campaignId: input.campaignId || undefined,
    startedAt,
    endedAt: now,
    durationSeconds,
    consent: {
      confirmed: input.consentConfirmed ?? true,
      method: input.consentMethod || 'verbal',
      confirmedAt: now,
      scriptVersion: '2026-07-26',
    },
    transcript: input.transcript.trim(),
    privateNotes: input.privateNotes.trim(),
    sharedSummary: input.sharedSummary.trim(),
    recording: input.recording,
    actions,
    participants: assignees.filter((assignee) => assignee.name.trim().length >= 2),
    status: encounterStatus,
    shareToken: input.shareToken || createId().replace(/-/g, ''),
  };
}

type TranscribePayload = {
  transcript?: string;
  source?: 'ai' | 'unavailable';
  unavailable?: string;
  error?: string;
  code?: string;
  retryable?: boolean;
  diarized?: boolean;
  speakers?: string[];
  segments?: Array<{
    id: string;
    speaker: string;
    text: string;
    start?: number;
    end?: number;
  }>;
};

function transcribeFailureMessage(status: number, payload: TranscribePayload, raw: string) {
  if (payload.error?.trim()) return payload.error.trim();
  if (status === 401) return 'Your session has expired. Sign in again and retry the import.';
  if (status === 404 || status === 405) {
    return 'Transcription API is not deployed yet. Deploy the latest web app, then try again.';
  }
  if (status === 413) {
    return 'Recording is too large to upload. Try a shorter clip or a compressed M4A/MP3 file.';
  }
  if (status >= 500) return 'Transcription service is temporarily unavailable. Try again in a moment.';
  if (raw.trim().startsWith('<!DOCTYPE') || raw.trim().startsWith('<html')) {
    return 'Transcription request failed. The recording may be too large. Try a shorter clip.';
  }
  return `Transcription failed (${status}).`;
}

async function parseTranscribeResponse(response: Response) {
  const raw = await response.text();
  let payload: TranscribePayload = {};
  try {
    payload = raw ? JSON.parse(raw) as TranscribePayload : {};
  } catch {
    throw new Error(transcribeFailureMessage(response.status, payload, raw));
  }
  if (!response.ok) {
    throw new Error(transcribeFailureMessage(response.status, payload, raw));
  }
  return {
    transcript: payload.transcript?.trim() || '',
    source: payload.source || 'unavailable' as const,
    unavailable: payload.unavailable,
    diarized: payload.diarized ?? false,
    speakers: payload.speakers ?? [],
    segments: payload.segments ?? [],
  };
}

async function transcribeViaMultipart(
  accessToken: string,
  prepared: PreparedAudioUpload,
  language?: string,
) {
  const formData = new FormData();
  formData.append('audio', new File(prepared.uri) as unknown as Blob, prepared.fileName);
  formData.append('fileName', prepared.fileName);
  formData.append('mimeType', prepared.mimeType);
  if (language?.trim()) formData.append('lang', language.trim());

  const response = await mobileFetch('/api/encounters/transcribe', accessToken, {
    method: 'POST',
    body: formData,
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
  });
  return parseTranscribeResponse(response);
}

async function transcribeViaBase64Json(
  accessToken: string,
  prepared: PreparedAudioUpload & { base64: string },
  language?: string,
) {
  const response = await mobileFetch('/api/encounters/transcribe', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64: prepared.base64,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      lang: language,
    }),
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
  });
  return parseTranscribeResponse(response);
}

export async function transcribeEncounterAudio(
  accessToken: string,
  uri: string,
  options?: { fileName?: string; mimeType?: string; language?: string },
) {
  const prepared = await prepareAudioFile(uri, options);
  const canUseBase64 = prepared.size === 0 || prepared.size <= MAX_BASE64_TRANSCRIBE_BYTES;

  if (canUseBase64) {
    try {
      const withBase64 = await prepareAudioUpload(uri, options);
      return await transcribeViaBase64Json(accessToken, withBase64, options?.language);
    } catch (error) {
      if (prepared.size > MAX_BASE64_TRANSCRIBE_BYTES) throw error;
      try {
        return await transcribeViaMultipart(accessToken, prepared, options?.language);
      } catch {
        throw error;
      }
    }
  }

  try {
    return await transcribeViaMultipart(accessToken, prepared, options?.language);
  } catch (error) {
    if (prepared.size <= MAX_BASE64_TRANSCRIBE_BYTES) {
      const withBase64 = await prepareAudioUpload(uri, options);
      return await transcribeViaBase64Json(accessToken, withBase64, options?.language);
    }
    throw error;
  }
}

export async function uploadEncounterRecording(
  accessToken: string,
  encounterId: string,
  uri: string,
) {
  const formData = new FormData();
  formData.append('audio', new File(uri) as unknown as Blob, guessRecordingFileName(uri));

  const response = await mobileFetch(`/api/encounters/${encounterId}/recording`, accessToken, {
    method: 'POST',
    body: formData,
  });
  const raw = await response.text();
  const payload = (() => {
    try {
      return raw ? JSON.parse(raw) as {
        ok?: boolean;
        error?: string;
        code?: string;
        retryable?: boolean;
        recording?: LocalRecordingMetadata;
      } : {};
    } catch {
      return {};
    }
  })();
  if (!response.ok || !payload.ok || !payload.recording) {
    const fallback = response.status === 401
      ? 'Your session has expired. Sign in again; your local recording is safe.'
      : response.status === 413
        ? 'This recording is too large to upload for sharing. Your local copy is safe.'
        : raw.trim().startsWith('<')
          ? 'The upload service returned an invalid response. Your local recording is safe. Retry later.'
          : 'The recording could not be uploaded for sharing. Your local copy is safe. Check your connection and retry.';
    const error = new Error(payload.error || fallback);
    Object.assign(error, { code: payload.code, retryable: payload.retryable ?? response.status >= 500 });
    throw error;
  }
  return payload.recording;
}

export async function uploadEncounterRecordingToDrive(
  accessToken: string,
  encounterId: string,
  uri: string,
) {
  const formData = new FormData();
  formData.append('encounterId', encounterId);
  formData.append('audio', new File(uri) as unknown as Blob, guessRecordingFileName(uri));

  const response = await mobileFetch('/api/integrations/google/drive/recording', accessToken, {
    method: 'POST',
    body: formData,
  });
  const payload = await readMobileApiJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    recording?: LocalRecordingMetadata;
  }>(response, 'Could not read the Google Drive upload response.');
  if (!response.ok || !payload.ok || !payload.recording) {
    const error = new Error(payload.error || 'Could not save this recording to Google Drive.');
    (error as Error & { code?: string }).code = payload.code;
    throw error;
  }
  return payload.recording;
}

export async function uploadEncounterRecordingToOneDrive(
  accessToken: string,
  encounterId: string,
  uri: string,
) {
  const formData = new FormData();
  formData.append('encounterId', encounterId);
  formData.append('audio', new File(uri) as unknown as Blob, guessRecordingFileName(uri));

  const response = await mobileFetch('/api/integrations/microsoft/onedrive/recording', accessToken, {
    method: 'POST',
    body: formData,
  });
  const payload = await readMobileApiJson<{
    ok?: boolean;
    error?: string;
    code?: string;
    recording?: LocalRecordingMetadata;
  }>(response, 'Could not read the OneDrive upload response.');
  if (!response.ok || !payload.ok || !payload.recording) {
    const error = new Error(payload.error || 'Could not save this recording to OneDrive.');
    (error as Error & { code?: string }).code = payload.code;
    throw error;
  }
  return payload.recording;
}

export async function saveEncounter(
  accessToken: string,
  encounter: EncounterPayload,
  options?: { expectedUpdatedAt?: string },
): Promise<{ updatedAt?: string; newGuestNames: string[]; eventId: string | null }> {
  const response = await mobileFetch('/api/encounters', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: encounter.id,
      title: encounter.title,
      personName: encounter.personName,
      personEmail: encounter.personEmail,
      contactId: encounter.contactId ?? null,
      exchangeId: encounter.exchangeId ?? null,
      campaignId: encounter.campaignId ?? null,
      // Omitted (not `?? null`) when unset — see lib/encounters.ts on the
      // server for why: this must NOT clear a passively-attached event on a
      // routine re-save that has no opinion about it. `eventId: ''` (the
      // correction flow's "No event") is a real value and is still sent.
      ...(encounter.eventId !== undefined ? { eventId: encounter.eventId } : {}),
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      durationSeconds: encounter.durationSeconds,
      consent: encounter.consent,
      transcript: encounter.transcript,
      privateNotes: encounter.privateNotes,
      sharedSummary: encounter.sharedSummary,
      actions: encounter.actions,
      participants: encounter.participants,
      status: encounter.status,
      shareToken: encounter.shareToken,
      ...(options?.expectedUpdatedAt ? { expectedUpdatedAt: options.expectedUpdatedAt } : {}),
      recording: encounter.recording
        ? {
            durationSeconds: encounter.recording.durationSeconds,
            fileSize: encounter.recording.fileSize,
            mimeType: encounter.recording.mimeType,
            source: encounter.recording.source,
            retention: encounter.recording.retention,
            expiresAt: encounter.recording.expiresAt,
            createdAt: encounter.recording.createdAt,
            audioLocation: encounter.recording.audioLocation ?? 'user_device',
            storagePath: encounter.recording.storagePath,
            sharedAudioUrl: encounter.recording.sharedAudioUrl,
            cloudExpiresAt: encounter.recording.cloudExpiresAt ?? null,
            driveFileId: encounter.recording.driveFileId,
            driveWebViewUrl: encounter.recording.driveWebViewUrl,
            oneDriveItemId: encounter.recording.oneDriveItemId,
            oneDriveWebUrl: encounter.recording.oneDriveWebUrl,
          }
        : null,
    }),
  });
  const payload = await readMobileApiJson<{
    ok?: boolean;
    error?: string;
    conflict?: boolean;
    serverUpdatedAt?: string;
    updatedAt?: string;
    newGuestNames?: string[];
    eventId?: string | null;
  }>(
    response,
    'Could not read the meeting save response.',
  );
  if (response.status === 409 && payload.conflict) {
    throw new EncounterConflictError(
      payload.error || 'This meeting changed on another device. Reload to see the latest version before saving your changes.',
      payload.serverUpdatedAt,
    );
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not save this meeting.');
  }
  requestFollowUpNotificationSync();
  return { updatedAt: payload.updatedAt, newGuestNames: payload.newGuestNames ?? [], eventId: payload.eventId ?? null };
}

export async function getEncounter(accessToken: string, id: string) {
  const response = await mobileFetch(`/api/encounters/${id}`, accessToken);
  const payload = await readMobileApiJson<{ encounter?: EncounterPayload; error?: string }>(
    response,
    'Could not read this meeting from AfterMeet.',
  );
  if (!response.ok || !payload.encounter) {
    throw new Error(payload.error || 'Encounter not found.');
  }
  return payload.encounter;
}

export async function deleteEncounter(accessToken: string, id: string) {
  const response = await mobileFetch(`/api/encounters/${id}`, accessToken, { method: 'DELETE' });
  const payload = await readMobileApiJson<{ ok?: boolean; error?: string }>(
    response,
    'Could not read the meeting deletion response.',
  );
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not delete this capture.');
  }
}

export async function generateOutboundDraft(
  accessToken: string,
  encounter: EncounterPayload,
) {
  if (!encounter.actions[0]) return null;
  const response = await mobileFetch('/api/encounters/outbound-draft', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      encounter,
      action: encounter.actions[0],
    }),
  });
  const payload = await readMobileApiJson<{ draft?: { body?: string; subject?: string }; error?: string }>(
    response,
    'Could not read the follow-up draft response.',
  );
  if (!response.ok || !payload.draft?.body) {
    throw new Error(payload.error || 'Could not draft a follow-up message.');
  }
  return payload.draft.body;
}

export async function fetchPublicCardName(baseUrl: string, slug: string) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/cards/public/${encodeURIComponent(slug)}`);
  if (!response.ok) return null;
  const payload = await readMobileApiJson<{ card?: { full_name?: string } }>(
    response,
    'Could not read this public card.',
  );
  return payload.card?.full_name?.trim() || null;
}

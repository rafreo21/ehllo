"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import { MagicWandIcon } from "@phosphor-icons/react/dist/csr/MagicWand";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { IdentificationCardIcon } from "@phosphor-icons/react/dist/csr/IdentificationCard";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { StopIcon } from "@phosphor-icons/react/dist/csr/Stop";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { UserPlusIcon } from "@phosphor-icons/react/dist/csr/UserPlus";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { ActiveCampaignField, defaultCampaignId } from "../../../components/ActiveCampaignField";
import { Button, LinkButton } from "../../../components/Button";
import { TextAreaField, SelectField, TextField } from "../../../components/FormField";
import { contactDisplayName, contactFromExchange, findContactById, readContacts, type Contact } from "../../../../lib/contacts";
import { linkEncountersToContact, resolveAndSaveContact } from "../../../../lib/person-links";
import { encounterToApiBody, formatDuration, writeEncounter, type Encounter } from "../../../../lib/encounters";
import {
  applyExtractionDraft,
  buildHeuristicDraft,
  EXTRACTION_DRAFT_NOTE,
  type EncounterExtractionCommitment,
  type EncounterExtractionDraft,
} from "../../../../lib/encounter-extraction";
import { cleanLiveTranscript } from "../../../../lib/transcript-cleanup";
import { transcribeEncounterAudioBlob } from "../../../../lib/encounter-transcription-client";
import {
  deleteLocalRecording,
  removeExpiredLocalRecordings,
  saveLocalRecording,
  type AudioRetention,
} from "../../../../lib/local-recordings";
import { uploadEncounterRecording } from "../../../../lib/recording-upload";
import { uploadRecordingToDrive } from "../../../../lib/google-drive-recording";
import { uploadRecordingToOneDrive } from "../../../../lib/onedrive-recording";
import type { ConnectedAccountStatus } from "../../../../lib/integrations/types";
import { emptyConnectedAccountStatus } from "../../../../lib/integrations/types";
import { isSupportedAudioFile } from "../../../../lib/audio-file";

type RecordingState = "idle" | "recording" | "paused" | "stopped";
type RecordingDestination = "local_only" | "shared_3_days" | "google_drive" | "onedrive";
type RemoteCaptureSession = {
  encounterId: string;
  sessionStatus: "draft" | "recording" | "paused" | "processing" | "review_ready" | "failed";
  failureReason?: string;
  step: number;
  durationSeconds: number;
  updatedAt: string;
  [key: string]: unknown;
};
type AdditionalParticipant = {
  id: string;
  name: string;
  email: string;
};
type CommitmentAssignment = {
  owner: "me" | "guest";
  targetName: string;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

// Compressed formats only — raw PCM/WAV hits the shared 25MB Whisper cap
// (lib/encounter-transcription-server.ts) after ~5 minutes of recording.
const PREFERRED_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function commitmentKey(commitment: EncounterExtractionCommitment, index: number): string {
  return `${index}:${commitment.title}:${commitment.channel}:${commitment.dueAt}`;
}

function defaultCommitmentKeys(commitments: EncounterExtractionCommitment[]): string[] {
  return commitments.flatMap((commitment, index) => commitment.title.trim() ? [commitmentKey(commitment, index)] : []);
}

function initialCommitmentAssignments(
  commitments: EncounterExtractionCommitment[],
  people: Array<{ name: string }>,
): Record<string, CommitmentAssignment> {
  return Object.fromEntries(commitments.map((commitment, index) => {
    const matchedPerson = people.find((person) => (
      person.name.trim().toLocaleLowerCase() === commitment.ownerName.trim().toLocaleLowerCase()
    ));
    return [commitmentKey(commitment, index), {
      owner: commitment.owner,
      targetName: (commitment.owner === "guest" ? matchedPerson?.name : people[0]?.name) || commitment.ownerName,
    }];
  }));
}


type InboundExchange = {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_company: string;
  visitor_role: string;
  note: string;
  status?: string;
  cards?: { full_name?: string; slug?: string } | { full_name?: string; slug?: string }[] | null;
};

const captureSteps = [
  { label: "Record", short: "Capture", Icon: MicrophoneIcon },
  { label: "Context", short: "Context", Icon: MagicWandIcon },
  { label: "Connect", short: "Connect", Icon: IdentificationCardIcon },
  { label: "Follow-up", short: "Follow-up", Icon: PaperPlaneTiltIcon },
  { label: "Review", short: "Review", Icon: EyeIcon, locked: true },
] as const;

const stepHeadings = [
  {
    title: "Record with consent.",
    copy: "Confirm consent, capture audio, then move on when you are ready. You can also skip recording and take notes only.",
  },
  {
    title: "Who did you meet?",
    copy: "Start with the person, then capture what mattered. Suggested drafts are starting points, not final truth.",
  },
  {
    title: "Connect their details.",
    copy: "Link this moment to someone in People, or share your card. Email syncs when they add you, not during capture.",
  },
  {
    title: "What happens next?",
    copy: "Add an optional follow-up, then continue to review before anything is shared.",
  },
] as const;

function webCaptureDevice() {
  const key = "aftermeet-capture-device-id-v1";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return { id, label: "Web browser" };
}

export default function NewEncounterPage() {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const pausedElapsedMsRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptFeedbackRef = useRef<number | null>(null);
  const transcriptStatusRef = useRef<"idle" | "listening" | "receiving" | "unavailable" | "transcribing">("idle");
  const liveTranscriptReceivedRef = useRef(false);
  const transcriptAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const recordingStateRef = useRef<RecordingState>("idle");
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const audioUrlRef = useRef("");
  const audioBlobRef = useRef<Blob | null>(null);
  const encounterIdRef = useRef("");
  const remoteSyncRef = useRef<number | null>(null);
  const lastRemoteUpdatedAtRef = useRef("");
  const lastSyncedChangeRef = useRef(0);
  const localChangeRef = useRef(0);
  const suppressNextRemoteSyncRef = useRef(false);
  const hydratedRemoteRef = useRef(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const personNameRef = useRef<HTMLInputElement | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentMethod, setConsentMethod] = useState<"verbal" | "written">("verbal");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDownloadName, setAudioDownloadName] = useState("aftermeet-recording.audio");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [transcriptSupported, setTranscriptSupported] = useState(true);
  const [transcriptStatus, setTranscriptStatus] = useState<"idle" | "listening" | "receiving" | "unavailable" | "transcribing">("idle");
  const [transcriptionRetryable, setTranscriptionRetryable] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [draftMessage, setDraftMessage] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("");
  const [crossDeviceMessage, setCrossDeviceMessage] = useState("");
  const [crossDeviceInterrupted, setCrossDeviceInterrupted] = useState(false);
  const [draftSource, setDraftSource] = useState<"ai" | "heuristic" | "">("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [uncertainFields, setUncertainFields] = useState<string[]>([]);
  const [commitmentSuggestions, setCommitmentSuggestions] = useState<EncounterExtractionCommitment[]>([]);
  const [selectedCommitmentKeys, setSelectedCommitmentKeys] = useState<string[]>([]);
  const [commitmentAssignments, setCommitmentAssignments] = useState<Record<string, CommitmentAssignment>>({});
  const extractionRequestRef = useRef(0);
  const [error, setError] = useState("");
  const [recordingSource, setRecordingSource] = useState<"recorded" | "imported">("recorded");
  const [retention, setRetention] = useState<AudioRetention>("7_days");
  const [recordingDestination, setRecordingDestination] = useState<RecordingDestination>("local_only");
  const [googleStatus, setGoogleStatus] = useState<ConnectedAccountStatus>(emptyConnectedAccountStatus());
  const [notesOnly, setNotesOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [captureStep, setCaptureStep] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(true);
  const [contactId, setContactId] = useState("");
  const [exchangeId, setExchangeId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [presetPersonEmail, setPresetPersonEmail] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inboundExchanges, setInboundExchanges] = useState<InboundExchange[]>([]);
  const [additionalParticipants, setAdditionalParticipants] = useState<AdditionalParticipant[]>([]);
  const [form, setForm] = useState({
    title: "",
    personName: "",
    transcript: "",
    privateNotes: "",
    sharedSummary: "",
    followUp: "",
    followUpType: "email" as Encounter["actions"][number]["channel"],
    dueAt: "",
  });

  const linkedContact = useMemo(
    () => contacts.find((contact) => contact.id === contactId) ?? null,
    [contacts, contactId],
  );

  useEffect(() => {
    if (hydratedRemoteRef.current) return;
    hydratedRemoteRef.current = true;
    const draftId = new URLSearchParams(window.location.search).get("draftId");
    if (!draftId) return;
    void fetch("/api/capture-sessions", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ sessions?: RemoteCaptureSession[] }> : { sessions: [] })
      .then((payload) => {
        const session = payload.sessions?.find((item) => item.encounterId === draftId);
        if (!session) return;
        suppressNextRemoteSyncRef.current = true;
        lastRemoteUpdatedAtRef.current = session.updatedAt;
        encounterIdRef.current = session.encounterId;
        setCaptureStep(Math.max(0, Math.min(3, Number(session.step) || 0)));
        setSeconds(Math.max(0, Number(session.durationSeconds) || 0));
        setConsent(Boolean(session.consent));
        setConsentMethod(session.consentMethod === "written" ? "written" : "verbal");
        setRecordingDestination(
          session.recordingDestination === "shared_3_days" || session.recordingDestination === "google_drive" || session.recordingDestination === "onedrive"
            ? session.recordingDestination
            : "local_only",
        );
        const people = Array.isArray(session.people) ? session.people as Array<Record<string, unknown>> : [];
        const [primary, ...others] = people;
        setForm((current) => ({
          ...current,
          personName: String(primary?.name ?? session.personName ?? ""),
          title: String(session.title ?? ""),
          transcript: String(session.transcript ?? ""),
          privateNotes: String(session.privateNotes ?? ""),
          sharedSummary: String(session.sharedSummary ?? ""),
          followUp: String(session.followUp ?? ""),
          followUpType: (typeof session.followUpType === "string" ? session.followUpType : "email") as Encounter["actions"][number]["channel"],
          dueAt: String(session.dueAt ?? ""),
        }));
        setAdditionalParticipants(others.map((person) => ({
          id: typeof person.id === "string" ? person.id : crypto.randomUUID(),
          name: String(person.name ?? ""),
          email: String(person.email ?? ""),
        })));
        if (session.sessionStatus === "failed" && session.failureReason === "recording_heartbeat_lost") {
          setRecoveryReason("recording_heartbeat_lost");
          setDraftMessage("The live recording was interrupted. Everything already captured is safe; review the draft and restart recording only if you need more audio.");
          setTranscriptOpen(Boolean(String(session.transcript ?? "").trim()));
        }
        if ((session.sessionStatus === "recording" || session.sessionStatus === "paused") && session.hasLocalAudio) {
          setDraftMessage(`Audio remains on ${String(session.deviceLabel || "the device that started this capture")}. Continue the context and follow-up here.`);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const hasProgress = consent || captureStep > 0 || seconds > 0 || form.transcript.trim() || form.title.trim()
      || form.personName.trim() || form.sharedSummary.trim() || form.followUp.trim() || additionalParticipants.length > 0;
    if (!hasProgress) return;
    localChangeRef.current += 1;
    if (suppressNextRemoteSyncRef.current) {
      suppressNextRemoteSyncRef.current = false;
      lastSyncedChangeRef.current = localChangeRef.current;
      return;
    }
    if (!encounterIdRef.current) encounterIdRef.current = crypto.randomUUID();
    if (remoteSyncRef.current) window.clearTimeout(remoteSyncRef.current);
    remoteSyncRef.current = window.setTimeout(() => {
      const device = webCaptureDevice();
      const activeStatus = recordingState === "recording" ? "recording"
        : recordingState === "paused" ? "paused"
          : recordingState === "stopped" ? "review_ready"
            : recoveryReason ? "failed" : "draft";
      const syncingChange = localChangeRef.current;
      void fetch("/api/capture-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encounterId: encounterIdRef.current,
          sessionStatus: activeStatus,
          failureReason: recoveryReason,
          step: captureStep,
          durationSeconds: seconds,
          consent,
          consentMethod,
          recordingDestination,
          people: [
            { id: "primary", name: form.personName, email: linkedContact?.email ?? "", phone: linkedContact?.phone ?? "" },
            ...additionalParticipants,
          ].filter((person) => person.name.trim()),
          ...form,
          deviceId: device.id,
          deviceLabel: device.label,
          hasLocalAudio: Boolean(audioBlobRef.current),
          updatedAt: new Date().toISOString(),
        }),
      }).then(async (response) => {
        if (response.ok) {
          lastSyncedChangeRef.current = syncingChange;
          return;
        }
        if (response.status === 409) {
          setCrossDeviceInterrupted(false);
          setCrossDeviceMessage("This capture moved forward on another device. Reload the latest version before making more changes here.");
        }
      }).catch(() => undefined);
    }, 700);
    return () => {
      if (remoteSyncRef.current) window.clearTimeout(remoteSyncRef.current);
    };
  }, [additionalParticipants, captureStep, consent, consentMethod, form, linkedContact, recordingDestination, recordingState, recoveryReason, seconds]);

  useEffect(() => {
    let cancelled = false;
    const refreshRemoteDraft = async () => {
      if (!encounterIdRef.current) return;
      if (document.visibilityState !== "visible" || recordingStateRef.current === "recording" || recordingStateRef.current === "paused") return;
      const response = await fetch("/api/capture-sessions", { cache: "no-store" }).catch(() => null);
      if (!response?.ok || cancelled) return;
      const payload = await response.json() as { sessions?: RemoteCaptureSession[] };
      const session = payload.sessions?.find((item) => item.encounterId === encounterIdRef.current);
      if (!session || session.deviceId === webCaptureDevice().id) return;
      if (Date.parse(session.updatedAt) <= Date.parse(lastRemoteUpdatedAtRef.current || "1970-01-01")) return;
      lastRemoteUpdatedAtRef.current = session.updatedAt;
      const interrupted = session.sessionStatus === "failed" && session.failureReason === "recording_heartbeat_lost";
      setCrossDeviceInterrupted(interrupted);
      if (localChangeRef.current !== lastSyncedChangeRef.current) {
        setCrossDeviceMessage(interrupted
          ? `Recording stopped unexpectedly on ${String(session.deviceLabel || "another device")}. Your captured context is safe; finish your local edits, then reopen the draft to review it.`
          : `Newer changes are available from ${String(session.deviceLabel || "another device")}. Reopen this draft after finishing your local edits.`);
        return;
      }
      setCrossDeviceMessage(interrupted
        ? `Recording stopped unexpectedly on ${String(session.deviceLabel || "another device")}. Reload to review everything captured before the interruption.`
        : `This draft was updated on ${String(session.deviceLabel || "another device")}. Reload to continue with the latest version; audio remains on the recording device.`);
    };
    const timer = window.setInterval(() => { void refreshRemoteDraft(); }, 15000);
    const onFocus = () => { void refreshRemoteDraft(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const confirmedPeople = useMemo(() => [
    {
      name: form.personName.trim(),
      email: linkedContact?.email?.trim() ?? "",
      phone: linkedContact?.phone?.trim() ?? "",
    },
    ...additionalParticipants.map((person) => ({
      name: person.name.trim(),
      email: person.email.trim(),
      phone: "",
    })),
  ].filter((person) => person.name.length >= 2), [additionalParticipants, form.personName, linkedContact]);

  useEffect(() => () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => {});
    recognitionRef.current?.stop();
    if (transcriptFeedbackRef.current) window.clearTimeout(transcriptFeedbackRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  useEffect(() => {
    transcriptStatusRef.current = transcriptStatus;
  }, [transcriptStatus]);

  useEffect(() => {
    void removeExpiredLocalRecordings().catch(() => {});
    void fetch("/api/integrations/status", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload: { status?: ConnectedAccountStatus } | null) => payload?.status && setGoogleStatus(payload.status))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setContacts(readContacts());
      const search = new URLSearchParams(window.location.search);
      const presetContact = search.get("contact");
      const presetName = search.get("personName")?.trim() || "";
      const presetEmail = search.get("personEmail")?.trim() || "";
      const presetSourceId = search.get("sourceId")?.trim() || "";
      const presetExchangeId = search.get("exchangeId")?.trim() || "";
      setSourceId(presetSourceId);
      setPresetPersonEmail(presetEmail);
      setExchangeId(presetExchangeId);
      if (presetContact) {
        setContactId(presetContact);
        const contact = findContactById(presetContact);
        if (contact) {
          setForm((current) => ({ ...current, personName: contactDisplayName(contact) }));
          setSourceId(contact.id);
          setPresetPersonEmail(contact.email);
          setExchangeId(contact.exchangeId ?? presetExchangeId);
          if (contact.campaignId) setCampaignId(contact.campaignId);
        }
      } else {
        if (presetName) setForm((current) => ({ ...current, personName: presetName }));
        setCampaignId(defaultCampaignId());
      }
    });
    void fetch("/api/cards/exchanges")
      .then(async (response) => (response.ok ? response.json() : { exchanges: [] }))
      .then((payload: { exchanges?: InboundExchange[] }) => {
        setInboundExchanges((payload.exchanges ?? []).filter((exchange) => exchange.status === "new" || !exchange.status));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [captureStep]);

  useEffect(() => {
    if (captureStep !== 1) return;
    window.setTimeout(() => personNameRef.current?.focus(), 120);
  }, [captureStep]);

  function replaceAudioUrl(nextUrl: string) {
    if (audioUrlRef.current && audioUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  }

  function releaseRecorderResources() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }

  function finalizeTranscript() {
    const merged = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.replace(/\s+/g, " ").trim();
    const cleaned = cleanLiveTranscript(merged);
    finalTranscriptRef.current = cleaned;
    interimTranscriptRef.current = "";
    setInterimTranscript("");
    setForm((current) => ({ ...current, transcript: cleaned }));
    return cleaned;
  }

  async function maybeTranscribeFromServer(
    blob: Blob,
    cleanedTranscript: string,
    options?: { preferSpeakerLabels?: boolean },
  ) {
    const needsServer =
      options?.preferSpeakerLabels ||
      cleanedTranscript.trim().length < 20 ||
      transcriptStatusRef.current === "unavailable" ||
      !liveTranscriptReceivedRef.current;
    if (!needsServer) return cleanedTranscript;

    setTranscriptStatus("transcribing");
    setTranscriptionRetryable(false);
    const result = await transcribeEncounterAudioBlob(blob, { language: "en" });
    if (result.transcript && (!options?.preferSpeakerLabels || result.diarized || cleanedTranscript.trim().length < 20)) {
      finalTranscriptRef.current = result.transcript;
      setForm((current) => ({ ...current, transcript: result.transcript }));
      setTranscriptStatus("idle");
      setTranscriptionRetryable(false);
      if (result.diarized && result.speakers?.length) {
        setDraftMessage(`${result.speakers.length} voices detected. Confirm their names on the review screen.`);
      }
      return result.transcript;
    }

    if (options?.preferSpeakerLabels && cleanedTranscript.trim().length >= 20) {
      setTranscriptStatus("idle");
      setDraftMessage("Transcript saved. Speaker detection was unavailable, so confirm names while reviewing the context.");
      return cleanedTranscript;
    }

    setTranscriptStatus("unavailable");
    setTranscriptionRetryable(result.retryable === true);
    setDraftMessage(result.error || (result.unavailable === "ai_not_configured"
      ? "Automatic transcription is not configured. Your recording is safe; paste or type a transcript to continue."
      : "Transcription is temporarily unavailable. Your recording is safe. Retry later or continue with manual notes."));
    setDraftSource("");
    return cleanedTranscript;
  }

  async function generateMeetingContext(transcript = finalTranscriptRef.current || form.transcript) {
    const clean = cleanLiveTranscript(transcript.trim());
    if (clean.length < 20) {
      setDraftMessage("Add or record more transcript before generating meeting context.");
      setDraftSource("");
      setUncertainFields([]);
      setCommitmentSuggestions([]);
      setSelectedCommitmentKeys([]);
      setCommitmentAssignments({});
      return;
    }

    const requestId = extractionRequestRef.current + 1;
    extractionRequestRef.current = requestId;
    setDraftLoading(true);

    try {
      try {
        const response = await fetch("/api/encounters/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: clean, personName: form.personName, people: confirmedPeople }),
        });
        if (requestId !== extractionRequestRef.current) return;

        if (response.ok) {
          const payload = await response.json() as {
            draft: EncounterExtractionDraft;
            source: "ai" | "heuristic";
            uncertainFields?: string[];
            unavailable?: string;
            fallback?: boolean;
          };
          const ownCommitments = payload.draft.commitments ?? [];
          setForm((current) => {
            const next = applyExtractionDraft(current, payload.draft, { replace: true });
            return ownCommitments.length ? { ...next, followUp: "" } : next;
          });
          setDraftMessage(
            payload.unavailable === "ai_not_configured"
              ? EXTRACTION_DRAFT_NOTE.aiNotConfigured
              : payload.fallback
                ? EXTRACTION_DRAFT_NOTE.aiFallback
                : EXTRACTION_DRAFT_NOTE[payload.source],
          );
          setDraftSource(payload.source);
          setUncertainFields(payload.uncertainFields ?? []);
          setCommitmentSuggestions(payload.draft.commitments ?? []);
          setSelectedCommitmentKeys(defaultCommitmentKeys(payload.draft.commitments ?? []));
          setCommitmentAssignments(initialCommitmentAssignments(payload.draft.commitments ?? [], confirmedPeople));
          return;
        }
      } catch {
        if (requestId !== extractionRequestRef.current) return;
      }

      const draft = buildHeuristicDraft(clean, form.personName);
      if (!draft) {
        setDraftMessage("Add or record more transcript before generating meeting context.");
        setDraftSource("");
        setUncertainFields([]);
        return;
      }
      const ownCommitments = draft.commitments ?? [];
      setForm((current) => {
        const next = applyExtractionDraft(current, draft, { replace: true });
        return ownCommitments.length ? { ...next, followUp: "" } : next;
      });
      setDraftMessage(EXTRACTION_DRAFT_NOTE.heuristic);
      setDraftSource("heuristic");
      setUncertainFields([]);
      setCommitmentSuggestions(draft.commitments ?? []);
      setSelectedCommitmentKeys(defaultCommitmentKeys(draft.commitments ?? []));
      setCommitmentAssignments(initialCommitmentAssignments(draft.commitments ?? [], confirmedPeople));
    } finally {
      if (requestId === extractionRequestRef.current) setDraftLoading(false);
    }
  }

  useEffect(() => {
    const transcript = form.transcript.trim();
    if (transcript.length < 20) return;
    const timeout = window.setTimeout(() => {
      void generateMeetingContext(transcript);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [form.transcript]);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyContact(contact: Contact) {
    setContactId(contact.id);
    setExchangeId(contact.exchangeId ?? "");
    if (contact.campaignId) setCampaignId(contact.campaignId);
    setForm((current) => ({
      ...current,
      personName: contactDisplayName(contact) || current.personName,
    }));
  }

  function clearContactLink() {
    setContactId("");
    setExchangeId("");
  }

  function addParticipant() {
    setAdditionalParticipants((current) => current.length >= 9 ? current : [
      ...current,
      { id: crypto.randomUUID(), name: "", email: "" },
    ]);
  }

  function updateParticipant(id: string, key: "name" | "email", value: string) {
    setAdditionalParticipants((current) => current.map((person) => (
      person.id === id ? { ...person, [key]: value } : person
    )));
  }

  function removeParticipant(id: string) {
    setAdditionalParticipants((current) => current.filter((person) => person.id !== id));
  }

  function linkInboundExchange(exchange: InboundExchange) {
    const card = Array.isArray(exchange.cards) ? exchange.cards[0] : exchange.cards;
    const contact = resolveAndSaveContact({
      ...contactFromExchange(exchange, card?.full_name || "your card"),
      campaignId: campaignId || undefined,
    });
    setContacts(readContacts());
    applyContact(contact);
  }

  const stepCompletion = [
    (notesOnly || consent) && recordingState !== "recording" && recordingState !== "paused",
    Boolean(form.personName.trim() || form.title.trim()),
    Boolean(contactId || exchangeId || captureStep >= 3),
    Boolean(form.personName.trim()),
    false,
  ];

  function goToCaptureStep(nextStep: number) {
    setError("");
    setCaptureStep(nextStep);
  }

  function continueFromRecord(options?: { skipRecording?: boolean }) {
    setError("");
    if (!options?.skipRecording && !consent) {
      setError("Confirm that everyone agreed before continuing.");
      return;
    }
    if (!options?.skipRecording && (recordingState === "recording" || recordingState === "paused")) {
      setError("Finish the recording before moving to meeting context.");
      return;
    }
    if (options?.skipRecording) setNotesOnly(true);
    if (form.transcript.trim()) void generateMeetingContext();
    else if (options?.skipRecording) {
      setDraftMessage("Add notes on the next step, or come back after recording.");
    }
    goToCaptureStep(1);
  }

  function continueFromContext() {
    setError("");
    if (!form.personName.trim()) {
      setError("Enter their full name.");
      personNameRef.current?.focus();
      return;
    }
    if (!form.title.trim() && !form.sharedSummary.trim() && !form.privateNotes.trim()) {
      setError("Add a meeting title or a short note about what you discussed.");
      return;
    }
    if (additionalParticipants.some((person) => person.name.trim().length < 2)) {
      setError("Add a name for every attendee, or remove the empty attendee.");
      return;
    }
    const contextSource = form.transcript.trim() || form.privateNotes.trim() || form.sharedSummary.trim();
    if (contextSource.length >= 20 && !draftLoading) void generateMeetingContext(contextSource);
    goToCaptureStep(2);
  }

  function continueFromConnect() {
    setError("");
    goToCaptureStep(3);
  }

  function startTranscript() {
    liveTranscriptReceivedRef.current = false;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setTranscriptSupported(false);
      setTranscriptStatus("unavailable");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    setTranscriptStatus("listening");
    if (transcriptFeedbackRef.current) window.clearTimeout(transcriptFeedbackRef.current);
    transcriptFeedbackRef.current = window.setTimeout(() => {
      if (!finalTranscriptRef.current.trim()) setTranscriptStatus("unavailable");
    }, 5000);
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${text}`.replace(/\s+/g, " ").trim();
        } else {
          interim += `${interim ? " " : ""}${text}`;
        }
      }
      if (interim || finalTranscriptRef.current) liveTranscriptReceivedRef.current = true;
      if (finalTranscriptRef.current) {
        const cleaned = cleanLiveTranscript(finalTranscriptRef.current);
        finalTranscriptRef.current = cleaned;
        setForm((current) => ({ ...current, transcript: cleaned }));
      }
      interimTranscriptRef.current = interim;
      if (interim || finalTranscriptRef.current) setTranscriptStatus("receiving");
      setInterimTranscript(interim);
    };
    recognition.onerror = () => {
      setTranscriptSupported(false);
      setTranscriptStatus("unavailable");
    };
    recognition.onend = () => {
      if (recordingStateRef.current === "recording") {
        try { recognition.start(); } catch {}
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {
      setTranscriptSupported(false);
      setTranscriptStatus("unavailable");
    }
  }

  async function startRecording() {
    setError("");
    if (!consent) {
      setError("Confirm that everyone agreed before recording.");
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia
      || !(window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      || typeof MediaRecorder === "undefined"
    ) {
      setError("Audio recording is not supported in this browser. You can still add notes and a transcript.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setRecoveryReason("");
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextConstructor();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      audioContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      pausedElapsedMsRef.current = 0;
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.start(1000);
      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        setAudioLevel(Math.min(1, rms * 8));
        if (recordingStateRef.current !== "recording") return;
        const elapsedMs = pausedElapsedMsRef.current + (Date.now() - recordingStartedAtRef.current);
        setSeconds(Math.floor(elapsedMs / 1000));
      };
      source.connect(processor);
      processor.connect(context.destination);
      recordingStateRef.current = "recording";
      setRecordingState("recording");
      setTranscriptOpen(true);
      finalTranscriptRef.current = form.transcript;
      interimTranscriptRef.current = "";
      setInterimTranscript("");
      startTranscript();
    } catch {
      setError("Microphone access was not granted. Check your browser permission and try again.");
    }
  }

  function pauseOrResume() {
    if (recordingState === "recording") {
      finalizeTranscript();
      recordingStateRef.current = "paused";
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.pause();
      pausedElapsedMsRef.current += Date.now() - recordingStartedAtRef.current;
      setRecordingState("paused");
      setAudioLevel(0);
    } else if (recordingState === "paused") {
      recordingStateRef.current = "recording";
      interimTranscriptRef.current = "";
      setInterimTranscript("");
      recordingStartedAtRef.current = Date.now();
      mediaRecorderRef.current?.resume();
      startTranscript();
      setRecordingState("recording");
    }
  }

  async function stopRecording() {
    if (recordingStateRef.current === "stopped") return;
    recordingStateRef.current = "stopped";
    const finalElapsedMs = recordingState === "paused"
      ? pausedElapsedMsRef.current
      : pausedElapsedMsRef.current + (Date.now() - recordingStartedAtRef.current);
    setSeconds(Math.max(0, Math.round(finalElapsedMs / 1000)));
    let cleanedTranscript = finalizeTranscript();

    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    await new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve();
        return;
      }
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });

    releaseRecorderResources();
    const blob = new Blob(recordedChunksRef.current, { type: mimeType });
    audioBlobRef.current = blob;
    setAudioDownloadName(`aftermeet-recording.${mimeType.includes("wav") ? "wav" : mimeType.includes("mp4") ? "m4a" : "webm"}`);
    setRecordingSource("recorded");
    replaceAudioUrl(URL.createObjectURL(blob));
    setAudioLevel(0);
    cleanedTranscript = await maybeTranscribeFromServer(blob, cleanedTranscript, { preferSpeakerLabels: true });
    if (cleanedTranscript) {
      window.setTimeout(() => generateMeetingContext(cleanedTranscript), 0);
    }
    setRecordingState("stopped");
    setTranscriptOpen(true);
  }

  async function importRecording(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!consent) {
      setError("Confirm that everyone agreed to the recording before importing it.");
      return;
    }
    if (!isSupportedAudioFile(file)) {
      setError("Choose an audio recording from Voice Memos, Files, or your device recorder.");
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      setError("That recording is larger than 250 MB. Please choose a shorter or compressed recording.");
      return;
    }
    releaseRecorderResources();
    audioBlobRef.current = file;
    setAudioDownloadName(file.name || "aftermeet-imported-recording.audio");
    setRecordingSource("imported");
    const url = URL.createObjectURL(file);
    replaceAudioUrl(url);
    setTranscriptOpen(true);
    setRecordingState("stopped");
    finalTranscriptRef.current = "";
    setForm((current) => ({ ...current, transcript: "" }));
    setTranscriptStatus("transcribing");
    setDraftMessage("Transcribing imported recording…");
    const serverTranscript = await maybeTranscribeFromServer(file, "");
    if (serverTranscript.trim().length >= 20) {
      void generateMeetingContext(serverTranscript);
      return;
    }
    setTranscriptStatus("idle");
    setDraftMessage("Recording imported. Add or paste its transcript, then draft the meeting context.");
    const audio = new Audio(url);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) setSeconds(Math.max(0, Math.round(audio.duration)));
    };
    audio.onerror = () => setError("The recording was imported, but its duration could not be read by this browser.");
  }

  async function saveEncounter(event: React.FormEvent, options?: { skipFollowUp?: boolean }) {
    event.preventDefault();
    setError("");
    if (audioBlobRef.current && !consent) {
      setError("Recording consent must be confirmed for this encounter.");
      return;
    }
    if (!form.personName.trim()) {
      setError("Enter their full name before saving.");
      return;
    }
    if (!form.title.trim() && !form.sharedSummary.trim() && !form.privateNotes.trim()) {
      setError("Add a meeting title or a short note about what you discussed.");
      return;
    }
    setSaving(true);
    const id = encounterIdRef.current || crypto.randomUUID();
    encounterIdRef.current = id;
    const now = new Date().toISOString();
    let recording: Encounter["recording"];
    if (audioBlobRef.current) {
      const localRetention: AudioRetention = recordingDestination === "local_only" ? retention : "7_days";
      try {
        recording = await saveLocalRecording(id, audioBlobRef.current, {
          durationSeconds: seconds,
          source: recordingSource,
          retention: localRetention,
        });
      } catch {
        setSaving(false);
        setError("We could not save the recording on this device. Free some storage or choose “Delete after transcript”, then try again.");
        return;
      }
    }
    const personEmail = linkedContact?.email ?? presetPersonEmail;
    const primaryParticipantId = sourceId || crypto.randomUUID();
    const participants: Encounter["participants"] = [{
      id: primaryParticipantId,
      name: form.personName.trim(),
      email: personEmail,
      phone: linkedContact?.phone ?? "",
      linkedIn: linkedContact?.linkedinUrl ?? "",
      exchangeId: exchangeId || undefined,
    }, ...additionalParticipants.map((person) => ({
      id: person.id,
      name: person.name.trim(),
      email: person.email.trim(),
      phone: "",
      linkedIn: "",
    }))];
    const participantNames = participants.map((person) => person.name).join(", ");
    const selectedCommitments = options?.skipFollowUp ? [] : commitmentSuggestions.flatMap((commitment, index) => {
      const key = commitmentKey(commitment, index);
      if (!selectedCommitmentKeys.includes(key)) return [];
      return [{ commitment, assignment: commitmentAssignments[key] ?? {
        owner: commitment.owner,
        targetName: commitment.ownerName,
      } }];
    });
    const manualFollowUp = options?.skipFollowUp ? "" : form.followUp.trim();
    const manualIsDuplicate = selectedCommitments.some(({ commitment }) => (
      commitment.title.trim().toLocaleLowerCase() === manualFollowUp.toLocaleLowerCase()
      && commitment.channel === form.followUpType
    ));
    const extractedActions: Encounter["actions"] = selectedCommitments.flatMap(({ commitment, assignment }) => {
      const participant = participants.find((person) => (
        person.name.trim().toLocaleLowerCase() === assignment.targetName.trim().toLocaleLowerCase()
      )) ?? participants[0];
      if (!participant) return [];
      return [{
        id: crypto.randomUUID(),
        title: commitment.title.trim(),
        channel: commitment.channel,
        owner: assignment.owner,
        dueAt: commitment.dueAt,
        status: "open",
        participantId: participant.id,
        assigneeName: participant.name,
        assigneeEmail: participant.email,
      }];
    });
    const manualActions: Encounter["actions"] = manualFollowUp && !manualIsDuplicate
      ? participants.map((participant) => ({
        id: crypto.randomUUID(),
        title: manualFollowUp,
        channel: form.followUpType,
        owner: "me",
        dueAt: form.dueAt,
        status: "open",
        participantId: participant.id,
        assigneeName: participant.name,
        assigneeEmail: participant.email,
      }))
      : [];
    let encounter: Encounter = {
      id,
      title: form.title.trim() || `Meeting with ${participantNames}`,
      personName: participantNames,
      personEmail,
      contactId: contactId || undefined,
      exchangeId: exchangeId || undefined,
      campaignId: campaignId || undefined,
      startedAt: new Date(Date.now() - seconds * 1000).toISOString(),
      endedAt: now,
      durationSeconds: seconds,
      consent: { confirmed: Boolean(audioBlobRef.current) && consent, method: consentMethod, confirmedAt: audioBlobRef.current ? now : "", scriptVersion: "2026-07-26" },
      transcript: form.transcript.trim(),
      privateNotes: form.privateNotes.trim(),
      sharedSummary: form.sharedSummary.trim(),
      recording,
      actions: [...extractedActions, ...manualActions],
      participants,
      status: "draft",
      shareToken: crypto.randomUUID().replaceAll("-", ""),
    };
    writeEncounter(encounter);
    const contactForLink = linkedContact ?? (contactId ? findContactById(contactId) : null);
    if (contactForLink) linkEncountersToContact(contactForLink);
    try {
      const response = await fetch("/api/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encounterToApiBody(encounter)),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setSaving(false);
        setError(result?.error || "Saved on this device, but cloud sync failed. Press “Save and review” to retry.");
        return;
      }
      if (audioBlobRef.current && recording && recordingDestination !== "local_only") {
        try {
          const uploaded = recordingDestination === "google_drive"
            ? await uploadRecordingToDrive(id, audioBlobRef.current, recording.mimeType)
            : recordingDestination === "onedrive"
              ? await uploadRecordingToOneDrive(id, audioBlobRef.current, recording.mimeType)
              : await uploadEncounterRecording(id, audioBlobRef.current, recording.mimeType);
          encounter = { ...encounter, recording: uploaded };
          writeEncounter(encounter);
          await fetch("/api/encounters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(encounterToApiBody(encounter)),
          });
          if (recordingDestination === "google_drive" || recordingDestination === "onedrive" || retention === "after_transcription") {
            await deleteLocalRecording(id).catch(() => {});
          }
        } catch (uploadError) {
          if (recordingDestination === "google_drive" || recordingDestination === "onedrive") {
            setSaving(false);
            setError(uploadError instanceof Error ? uploadError.message : "Cloud storage upload failed. Your recording remains safe on this device.");
            return;
          }
          // The review screen can retry optional three-day sharing.
        }
      } else if (audioBlobRef.current && recordingDestination === "local_only" && retention === "after_transcription") {
        await deleteLocalRecording(id).catch(() => {});
      }
    } catch {
      setSaving(false);
      setError("Saved on this device, but you appear to be offline. Reconnect and press “Save and review” to retry.");
      return;
    }
    const draft = encodeURIComponent(JSON.stringify(encounter));
    window.location.href = `/app/encounters/${id}?draft=${draft}`;
  }

  const privacyRail = [
    [
      { title: "Private to you", text: "Raw recording, full transcript, and anything you mark private." },
      { title: "Shared only after review", text: "Summary and actions are never sent automatically from this step." },
    ],
    [
      { title: "Private notes", text: "Only you ever see these, even after sharing the meeting record." },
      { title: "Shared summary", text: "The other person can see this only after you approve it on review." },
      { title: "Source transcript", text: "Keep the transcript open while editing so you stay grounded in what was said." },
    ],
    [
      { title: "Details sync on connect", text: "Email and contact methods arrive when you link someone from People or they share back from your card." },
      { title: "Share your card", text: "If you have not exchanged details yet, open your QR on the next screen." },
    ],
    [
      { title: "Optional next step", text: "Follow-up is not required. You can save now and add actions later." },
      { title: "Lands in Inbox", text: "Anything you add here becomes a task you can complete from Inbox." },
      { title: "Next: Review", text: "Review is where you confirm private vs shared content before anything goes out." },
    ],
  ] as const;

  const recordingComplete = recordingState === "stopped" || Boolean(audioUrl);

  useAppShellChrome({ backHref: "/app" });
  return (
    <>
      <form className="encounter-layout" onSubmit={saveEncounter}>
        <section className="encounter-main" ref={mainRef}>
          {captureStep > 0 ? (
            <div className="encounter-heading">
              <h1>{stepHeadings[captureStep]?.title ?? "Review"}</h1>
              <p>{stepHeadings[captureStep]?.copy ?? ""}</p>
            </div>
          ) : null}

          <nav className="creator-steps encounter-steps" aria-label="Encounter capture progress">
            {captureSteps.map(({ label, short, Icon, locked }, index) => (
              <button
                key={label}
                type="button"
                disabled={locked}
                title={locked ? "Opens after you save" : undefined}
                aria-current={index === captureStep ? "step" : undefined}
                aria-disabled={locked || undefined}
                className={[
                  index === captureStep ? "active" : "",
                  stepCompletion[index] ? "complete" : "",
                  locked ? "locked" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => {
                  if (locked || index === captureStep) return;
                  if (index < captureStep) {
                    goToCaptureStep(index);
                    return;
                  }
                  if (index === 1) continueFromRecord();
                  if (index === 2) continueFromContext();
                  if (index === 3) continueFromConnect();
                }}
              >
                <span>{stepCompletion[index] && index !== captureStep ? <CheckCircleIcon weight="fill" /> : <Icon weight="bold" />}</span>
                <small>{short}</small>
                <strong>{label}</strong>
              </button>
            ))}
          </nav>

          {crossDeviceMessage ? (
            <div className={`encounter-success-banner${crossDeviceInterrupted ? " is-interrupted" : ""}`} role="status">
              {crossDeviceInterrupted
                ? <StopIcon size={22} weight="fill" />
                : <CheckCircleIcon size={22} weight="fill" />}
              <div>
                <strong>{crossDeviceInterrupted ? "Recording interrupted" : "Capture updated elsewhere"}</strong>
                <p>{crossDeviceMessage}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => window.location.reload()}>Reload draft</Button>
            </div>
          ) : null}

          {captureStep === 0 && <>
          <section className="quick-context-card">
            <header className="encounter-card-header">
              <span className="encounter-card-icon"><MagicWandIcon size={22} weight="bold" /></span>
              <div className="encounter-card-copy"><h2>Quick context</h2><p>Skip recording and add notes from memory.</p></div>
            </header>
            <Button type="button" variant="secondary" onClick={() => continueFromRecord({ skipRecording: true })}>Add notes instead <ArrowRightIcon size={16} weight="bold" /></Button>
          </section>
          <section className={`consent-card ${consent ? "confirmed" : ""}`}>
            <header className="encounter-card-header">
              <span className="encounter-card-icon consent-icon">{consent ? <CheckCircleIcon size={24} weight="fill" /> : <MicrophoneIcon size={24} weight="bold" />}</span>
              <div className="encounter-card-copy">
              <h2>Confirm recording consent</h2>
              <p>Ask clearly: “Is everyone comfortable with me recording this conversation so I can remember the agreed next steps?”</p>
              </div>
            </header>
            <div className="consent-controls">
              <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Everyone agreed</label>
              <SelectField compact hideLabel label="Consent method" className="consent-method-field" value={consentMethod} onChange={(event) => setConsentMethod(event.target.value as "verbal" | "written")}>
                <option value="verbal">Verbal consent</option>
                <option value="written">Written consent</option>
              </SelectField>
            </div>
          </section>

          <section className={`recorder-card ${recordingState === "recording" ? "is-recording" : ""}`}>
            <header className="encounter-card-header recorder-status">
              <span className="encounter-card-icon recorder-status-icon"><MicrophoneIcon size={24} weight={recordingState === "recording" ? "fill" : "bold"} /></span>
              <div className="encounter-card-copy"><h2>{recordingState === "recording" ? "Recording" : recordingState === "paused" ? "Paused" : recordingState === "stopped" ? "Recording complete" : "Ready to record"}</h2><p>Microphone is {recordingState === "recording" ? "on" : "off"}</p></div>
              <time>{formatDuration(seconds)}</time>
            </header>
            {(recordingState === "recording" || recordingState === "paused") && <div className="audio-feedback" role="status" aria-live="polite">
              <div className="audio-meter" aria-hidden="true">
                {Array.from({ length: 14 }, (_, index) => <span key={index} style={{ height: `${Math.max(4, audioLevel * (10 + ((index * 7) % 18)))}px` }} />)}
              </div>
              <strong>{recordingState === "paused" ? "Recording paused" : audioLevel > .08 ? "Voice detected" : "Listening for speech…"}</strong>
            </div>}
            <div className="recorder-actions">
              {recordingState === "idle" && <Button onClick={startRecording} disabled={!consent}><MicrophoneIcon size={18} weight="fill" />Start recording</Button>}
              {recordingState === "idle" && <label className={`import-recording-button ${!consent ? "disabled" : ""}`}>
                <UploadSimpleIcon size={18} weight="bold" />Import recording
                <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.aac,.ogg" disabled={!consent} onChange={importRecording} />
              </label>}
              {(recordingState === "recording" || recordingState === "paused") && <>
                <Button variant="secondary" onClick={pauseOrResume}>{recordingState === "paused" ? <PlayIcon size={18} weight="fill" /> : <PauseIcon size={18} weight="fill" />}{recordingState === "paused" ? "Resume" : "Pause"}</Button>
                <Button onClick={stopRecording}><StopIcon size={18} weight="fill" />Finish</Button>
              </>}
              {recordingState === "stopped" && <Button variant="secondary" onClick={() => { recordingStateRef.current = "idle"; pausedElapsedMsRef.current = 0; recordedChunksRef.current = []; audioBlobRef.current = null; setRecordingState("idle"); setSeconds(0); replaceAudioUrl(""); setDraftMessage(""); setTranscriptStatus("idle"); }}>Record again</Button>}
              <Button variant="ghost" onClick={() => setTranscriptOpen((value) => !value)}>
                {transcriptOpen ? <CaretUpIcon size={16} weight="bold" /> : <CaretDownIcon size={16} weight="bold" />}
                {transcriptOpen ? "Hide transcript" : "Show transcript"}
              </Button>
            </div>
            {audioUrl && <audio className="audio-review" controls src={audioUrl} onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              if (Number.isFinite(duration)) setSeconds(Math.round(duration));
            }}>Your browser does not support audio playback.</audio>}
            {transcriptOpen && <div className="live-transcript">
              <header><div><strong>Live transcript</strong><small>{transcriptStatus === "receiving" ? "Receiving speech live" : transcriptStatus === "listening" ? "Listening for words…" : transcriptStatus === "transcribing" ? "Transcribing recording…" : transcriptStatus === "unavailable" ? "Live transcription unavailable. Audio is still recording" : "Editable meeting record"}</small></div></header>
              <textarea
                ref={transcriptAreaRef}
                aria-label="Live transcript"
                rows={6}
                value={`${form.transcript}${interimTranscript ? `${form.transcript ? " " : ""}${interimTranscript}` : ""}`}
                onInput={(event) => {
                  const value = cleanLiveTranscript(event.currentTarget.value);
                  finalTranscriptRef.current = value;
                  interimTranscriptRef.current = "";
                  setInterimTranscript("");
                  setForm((current) => ({ ...current, transcript: value }));
                }}
                onChange={(event) => {
                  const value = cleanLiveTranscript(event.target.value);
                  finalTranscriptRef.current = value;
                  interimTranscriptRef.current = "";
                  setInterimTranscript("");
                  update("transcript", value);
                }}
                placeholder={transcriptSupported ? "Your transcript will appear here while you record…" : "Live transcription is unavailable in this browser. Paste or type the transcript here."}
              />
              {!transcriptSupported && <small>Audio recording is working, but this browser could not provide live speech-to-text. ehllo will transcribe the recording when you stop, or you can type or paste a transcript here.</small>}
              {transcriptionRetryable && audioUrl ? (
                <Button variant="secondary" onClick={() => void maybeTranscribeFromServer(audioBlobRef.current!, finalTranscriptRef.current)}>
                  Retry transcription
                </Button>
              ) : null}
              {draftMessage && <p className="encounter-draft-note"><span className="encounter-draft-label">{draftSource === "ai" ? "AI draft" : "Suggested draft"}</span>{draftMessage.replace(/^(AI draft|Suggested draft)[^.]*\.\s*/, "")}{draftLoading ? " Generating…" : ""}</p>}
              {uncertainFields.length > 0 && <p className="encounter-draft-uncertain">Double-check: {uncertainFields.join(", ")}</p>}
            </div>}
            <small className="recording-note">{audioUrl ? `This ${recordingSource === "imported" ? "imported recording" : "recording"} will be stored locally when you save the encounter.` : "Record here or import audio from Voice Memos, Files, or your device recorder."}</small>
            {audioUrl && <a className="download-recording" href={audioUrl} download={audioDownloadName}>Download recording</a>}
          </section>

          {recordingComplete && captureStep === 0 && (
            <div className="encounter-success-banner" role="status">
              <CheckCircleIcon size={22} weight="fill" />
              <div>
                <strong>Recording ready</strong>
                <p>{form.transcript.trim() ? "We will draft meeting context from your transcript on the next step." : "Continue to add meeting context, or paste a transcript first."}</p>
              </div>
            </div>
          )}

          {error && <p className="encounter-error" role="alert">{error}</p>}
          <div className="form-actions encounter-step-actions">
            <LinkButton variant="ghost" href="/app">Cancel</LinkButton>
            <div className="encounter-step-actions-primary">
              <Button type="button" onClick={() => continueFromRecord()} disabled={!consent || recordingState === "recording" || recordingState === "paused"} className={recordingComplete ? "encounter-primary-ready" : undefined}>
                {recordingComplete ? "Next: meeting context" : "Continue"} <ArrowRightIcon size={18} weight="bold" />
              </Button>
            </div>
          </div>
          </>}

          {captureStep === 1 && <>
          {(draftLoading || (form.transcript.trim() && (form.title.trim() || form.sharedSummary.trim()))) && (
            <section className={`encounter-processing-card ${draftLoading ? "is-processing" : "is-ready"}`} role="status" aria-live="polite">
              <span className="encounter-processing-icon">
                {draftLoading ? <MagicWandIcon size={22} weight="bold" /> : <CheckCircleIcon size={22} weight="fill" />}
              </span>
              <div>
                <strong>{draftLoading ? "Turning the conversation into context…" : "Context ready to review"}</strong>
                <p>{draftLoading
                  ? "We’re identifying the people, summary, commitments, and likely follow-ups."
                  : `${form.personName.trim() || "Confirm who you met"}${form.title.trim() ? ` · ${form.title.trim()}` : ""}`}</p>
              </div>
            </section>
          )}
          {form.transcript.trim() && (
            <section className="encounter-source-panel">
              <button type="button" className="encounter-source-toggle" onClick={() => setSourceOpen((value) => !value)} aria-expanded={sourceOpen}>
                <div><strong>Source transcript</strong><small>Reference what was said while you edit the summary.</small></div>
                {sourceOpen ? <CaretUpIcon size={16} weight="bold" /> : <CaretDownIcon size={16} weight="bold" />}
              </button>
              {sourceOpen && <TextAreaField label="Transcript" hint="Private" rows={5} value={form.transcript} onChange={(event) => update("transcript", event.target.value)} />}
            </section>
          )}
          <section className="encounter-form-section">
            <header className="encounter-card-header">
              <span className="encounter-card-icon"><MagicWandIcon size={22} weight="bold" /></span>
              <div className="encounter-card-copy"><h2>Meeting context</h2><p>Who was it with and what mattered? Contact details sync on the next step.</p></div>
            </header>
            {draftMessage && <p className="encounter-draft-note"><span className="encounter-draft-label">{draftSource === "ai" ? "AI draft" : "Suggested draft"}</span>{draftMessage.replace(/^(AI draft|Suggested draft)[^.]*\.\s*/, "")}{draftLoading ? " Generating…" : ""}</p>}
            {uncertainFields.length > 0 && <p className="encounter-draft-uncertain">Double-check: {uncertainFields.join(", ")}</p>}
            {contacts.length > 0 && (
              <SelectField
                label="Pick from People"
                hint="Optional"
                value={contactId}
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) {
                    clearContactLink();
                    return;
                  }
                  const contact = contacts.find((item) => item.id === id);
                  if (contact) applyContact(contact);
                }}
              >
                <option value="">Type a name below…</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contactDisplayName(contact)}{contact.company ? ` · ${contact.company}` : ""}
                  </option>
                ))}
              </SelectField>
            )}
            <TextField
              ref={personNameRef}
              label="Full name"
              value={form.personName}
              onChange={(event) => {
                clearContactLink();
                update("personName", event.target.value);
              }}
              placeholder="e.g. Sarah Chen"
              autoComplete="name"
              autoFocus
            />
            <div className="encounter-attendees" aria-label="Meeting attendees">
              <div className="encounter-attendees-heading">
                <div>
                  <strong>Other attendees</strong>
                  <small>Add everyone who should have their own relationship record and follow-up.</small>
                </div>
                <Button type="button" variant="secondary" size="small" onClick={addParticipant} disabled={additionalParticipants.length >= 9}>
                  <UserPlusIcon size={15} weight="bold" /> Add person
                </Button>
              </div>
              {additionalParticipants.length > 0 && (
                <div className="encounter-attendee-list">
                  {additionalParticipants.map((person, index) => (
                    <div className="encounter-attendee-row" key={person.id}>
                      <span className="encounter-attendee-number">{index + 2}</span>
                      <TextField
                        label={`Attendee ${index + 2} name`}
                        value={person.name}
                        onChange={(event) => updateParticipant(person.id, "name", event.target.value)}
                        placeholder="e.g. James Okafor"
                        autoComplete="off"
                      />
                      <TextField
                        label="Email"
                        hint="Optional"
                        type="email"
                        value={person.email}
                        onChange={(event) => updateParticipant(person.id, "email", event.target.value)}
                        placeholder="james@example.com"
                        autoComplete="off"
                      />
                      <Button type="button" variant="ghost" size="small" aria-label={`Remove attendee ${index + 2}`} onClick={() => removeParticipant(person.id)}>
                        <XIcon size={16} weight="bold" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {additionalParticipants.length === 0 && <p>No additional attendees.</p>}
            </div>
            <ActiveCampaignField value={campaignId} onChange={setCampaignId} />
            <TextField label="Meeting title" value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Coffee after ProductCon" hint="Optional if the full name is enough" />
            <TextAreaField label="Private notes" hint="Only you: what they said that matters" rows={4} value={form.privateNotes} onChange={(event) => update("privateNotes", event.target.value)} placeholder="Key points from the other person: their priorities, constraints, commitments, and anything you'd want to remember later." />
            <TextAreaField label="Shared meeting summary" hint="Review before sharing" rows={4} value={form.sharedSummary} onChange={(event) => update("sharedSummary", event.target.value)} placeholder="What you both discussed and agreed, neutral enough to share with them." />
            {(form.transcript.trim() || form.privateNotes.trim() || form.sharedSummary.trim()) && <Button type="button" variant="secondary" loading={draftLoading} onClick={() => void generateMeetingContext(form.transcript.trim() || form.privateNotes.trim() || form.sharedSummary.trim())}><MagicWandIcon size={15} weight="bold" />{draftLoading ? "Generating draft…" : "Draft commitments and follow-up"}</Button>}
          </section>
          {error && <p className="encounter-error" role="alert">{error}</p>}
          <div className="form-actions encounter-step-actions">
            <Button type="button" variant="ghost" onClick={() => goToCaptureStep(0)}><ArrowLeftIcon size={16} />Back</Button>
            <Button type="button" onClick={continueFromContext}>
              Next: connect <ArrowRightIcon size={18} weight="bold" />
            </Button>
          </div>
          </>}

          {captureStep === 2 && <>
          <section className="encounter-form-section encounter-connect-section">
            <header className="encounter-card-header">
              <span className="encounter-card-icon"><IdentificationCardIcon size={22} weight="bold" /></span>
              <div className="encounter-card-copy"><h2>Connect</h2><p>Link this moment to a person. Email and contact methods sync here, not during capture.</p></div>
            </header>
            {linkedContact ? (
              <div className="encounter-linked-person">
                <CheckCircleIcon size={24} weight="fill" />
                <div>
                  <strong>{contactDisplayName(linkedContact)}</strong>
                  <small>{linkedContact.email || linkedContact.company || linkedContact.role || "Linked from People"}</small>
                </div>
                <Button type="button" variant="ghost" size="small" onClick={clearContactLink}>Change</Button>
              </div>
            ) : (
              <>
                {inboundExchanges.length > 0 && (
                  <div className="encounter-inbound-list">
                    <span className="encounter-connect-label">Shared back from your card</span>
                    {inboundExchanges.map((exchange) => (
                      <button key={exchange.id} type="button" className="encounter-inbound-row" onClick={() => linkInboundExchange(exchange)}>
                        <strong>{exchange.visitor_name}</strong>
                        <small>{exchange.visitor_email || exchange.visitor_company || "No email yet"}</small>
                      </button>
                    ))}
                  </div>
                )}
                <div className="encounter-connect-actions">
                  <LinkButton variant="secondary" href="/app/cards#share"><QrCodeIcon size={16} weight="bold" />Share your card</LinkButton>
                  <LinkButton variant="ghost" href="/app/people"><UsersThreeIcon size={16} weight="bold" />Open Connections</LinkButton>
                </div>
                <p className="follow-up-note">You can continue without linking. Add their details later from People.</p>
              </>
            )}
          </section>
          {error && <p className="encounter-error" role="alert">{error}</p>}
          <div className="form-actions encounter-step-actions">
            <Button type="button" variant="ghost" onClick={() => goToCaptureStep(1)}><ArrowLeftIcon size={16} />Back</Button>
            <Button type="button" onClick={continueFromConnect}>
              Next: follow-up <ArrowRightIcon size={18} weight="bold" />
            </Button>
          </div>
          </>}

          {captureStep === 3 && <>
          <section className="encounter-recap">
            <h2>{form.personName.trim() || form.title.trim() || "Untitled meeting"}</h2>
            <p className="encounter-recap-copy">{form.personName.trim() && form.title.trim() ? form.title.trim() : form.personName.trim() ? "Add a title on the previous step if helpful." : "Add a person on the previous step if you can."}{form.sharedSummary.trim() ? ` · ${form.sharedSummary.trim()}` : ""}</p>
          </section>
          {audioUrl && (
            <section className="encounter-advanced-panel">
              <button type="button" className="encounter-advanced-toggle" onClick={() => setAudioSettingsOpen((value) => !value)} aria-expanded={audioSettingsOpen}>
                <div><strong>Recording storage</strong><small>Choose this device, three-day sharing, Google Drive, or OneDrive.</small></div>
                {audioSettingsOpen ? <CaretUpIcon size={16} weight="bold" /> : <CaretDownIcon size={16} weight="bold" />}
              </button>
              {audioSettingsOpen && (
                <div className="local-audio-settings">
                  <div><strong>Where should the recording live?</strong><small>Transcript, summary, and reviewed follow-ups sync separately in ehllo.</small></div>
                  <SelectField label="Recording storage" value={recordingDestination} onChange={(event) => setRecordingDestination(event.target.value as RecordingDestination)}>
                    <option value="local_only">Local only on this device</option>
                    <option value="shared_3_days">Share online for 3 days</option>
                    <option value="google_drive" disabled={!googleStatus.google.capabilities.drive}>Keep in my Google Drive</option>
                    <option value="onedrive" disabled={!googleStatus.microsoft.capabilities.onedrive}>Keep in my OneDrive</option>
                  </SelectField>
                  {recordingDestination === "local_only" ? <SelectField label="Local retention" value={retention} onChange={(event) => setRetention(event.target.value as AudioRetention)}><option value="after_transcription">Delete after transcript</option><option value="24_hours">For 24 hours</option><option value="7_days">For 7 days</option><option value="never">Until I delete it</option></SelectField> : null}
                  {!googleStatus.google.capabilities.drive ? <p className="drive-connection-note">Want to keep recordings in Drive? <a href="/api/integrations/google/connect?return_to=/app/settings">Connect or reconnect Google</a>.</p> : null}
                  {!googleStatus.microsoft.capabilities.onedrive ? <p className="drive-connection-note">Want to keep recordings in OneDrive? <a href="/api/integrations/microsoft/connect?return_to=/app/settings">Connect or reconnect Microsoft</a>.</p> : null}
                </div>
              )}
            </section>
          )}
          <section className="encounter-form-section encounter-followup-section">
            <header className="encounter-card-header">
              <span className="encounter-card-icon"><PaperPlaneTiltIcon size={22} weight="bold" /></span>
              <div className="encounter-card-copy"><h2>Follow-up</h2><p>Optional. Add one next step now, or save and handle it later from review.</p></div>
            </header>
            <div className="follow-up-fields">
              {commitmentSuggestions.length > 0 && (
                <section className="encounter-commitment-suggestions" aria-labelledby="suggested-followups-heading">
                  <div className="encounter-commitment-heading">
                    <div>
                      <strong id="suggested-followups-heading">Suggested from the conversation</strong>
                      <small>Every included promise becomes its own follow-up. Remove any suggestion that is wrong.</small>
                    </div>
                  </div>
                  <div className="encounter-commitment-list">
                    {commitmentSuggestions.map((commitment, sourceIndex) => ({ commitment, sourceIndex })).map(({ commitment, sourceIndex }) => {
                      const key = commitmentKey(commitment, sourceIndex);
                      const selected = selectedCommitmentKeys.includes(key);
                      const assignment = commitmentAssignments[key] ?? { owner: commitment.owner, targetName: commitment.ownerName };
                      return <article className={`encounter-commitment-option${selected ? " is-selected" : ""}`} key={key}>
                        <button
                          type="button"
                          className="encounter-commitment-toggle"
                          aria-pressed={selected}
                          onClick={() => setSelectedCommitmentKeys((current) => (
                            current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
                          ))}
                        >
                          <span><strong>{commitment.title}</strong><small>{commitment.channel}{commitment.dueAt ? ` · due ${commitment.dueAt}` : " · no due date agreed"}</small></span>
                          <span>{selected ? "Included" : "Add"}</span>
                        </button>
                        {selected && <div className="encounter-commitment-assignment">
                          <label>
                            <span>Owner</span>
                            <select value={assignment.owner === "me" ? "me" : assignment.targetName} onChange={(event) => {
                              const value = event.target.value;
                              setCommitmentAssignments((current) => ({
                                ...current,
                                [key]: value === "me"
                                  ? { owner: "me", targetName: current[key]?.targetName || confirmedPeople[0]?.name || "" }
                                  : { owner: "guest", targetName: value },
                              }));
                            }}>
                              <option value="me">You</option>
                              {confirmedPeople.map((person) => <option value={person.name} key={person.name}>{person.name}</option>)}
                            </select>
                          </label>
                          {assignment.owner === "me" && confirmedPeople.length > 1 && <label>
                            <span>Track with</span>
                            <select value={assignment.targetName} onChange={(event) => setCommitmentAssignments((current) => ({
                              ...current,
                              [key]: { ...assignment, targetName: event.target.value },
                            }))}>
                              {confirmedPeople.map((person) => <option value={person.name} key={person.name}>{person.name}</option>)}
                            </select>
                          </label>}
                        </div>}
                      </article>;
                    })}
                  </div>
                </section>
              )}
              {confirmedPeople.length > 1 && (
                <div className="encounter-followup-people">
                  <strong>Applies to everyone</strong>
                  <small>ehllo creates one reminder per person so each relationship stays separate.</small>
                  <div>{confirmedPeople.map((person) => <span key={`${person.name}-${person.email}`}>{person.name}</span>)}</div>
                </div>
              )}
              <TextField label={selectedCommitmentKeys.length ? "Add another follow-up (optional)" : "What needs to be done? (optional)"} value={form.followUp} onChange={(event) => update("followUp", event.target.value)} placeholder="e.g. Send Sarah the revised product draft" />
              <div className="follow-up-meta">
                <SelectField label="Follow-up type" value={form.followUpType} onChange={(event) => setForm((current) => ({ ...current, followUpType: event.target.value as Encounter["actions"][number]["channel"] }))}>
                  <option value="email">Send an email</option>
                  <option value="call">Make a call</option>
                  <option value="linkedin">Connect on LinkedIn</option>
                  <option value="meeting">Schedule a meeting</option>
                  <option value="send">Send a draft or file</option>
                  <option value="whatsapp">Message on WhatsApp</option>
                  <option value="instagram">Connect on Instagram</option>
                  <option value="x">Connect on X</option>
                  <option value="tiktok">Connect on TikTok</option>
                  <option value="other">Other next step</option>
                </SelectField>
                <TextField label="Due date" type="date" value={form.dueAt} onChange={(event) => update("dueAt", event.target.value)} />
              </div>
              <p className="follow-up-note">This becomes an item in your Inbox until you complete it.</p>
            </div>
            {error && <p className="encounter-error" role="alert">{error}</p>}
            <div className="form-actions encounter-step-actions">
              <Button type="button" variant="ghost" onClick={() => goToCaptureStep(2)}><ArrowLeftIcon size={16} />Back</Button>
              <div className="encounter-step-actions-primary">
                <Button type="button" variant="ghost" loading={saving} onClick={(event) => void saveEncounter(event, { skipFollowUp: true })}>Save without follow-up</Button>
                <Button type="submit" loading={saving}>Save and review (step 5)</Button>
              </div>
            </div>
          </section>
          </>}
        </section>

        <aside className="privacy-rail encounter-privacy-rail">
          <span>{captureStep === 0 ? "Before you continue" : captureStep === 1 ? "While you edit" : captureStep === 2 ? "While you connect" : "Before you save"}</span>
          {(privacyRail[captureStep] ?? privacyRail[3]).map((item) => (
            <article key={item.title}><strong>{item.title}</strong><p>{item.text}</p></article>
          ))}
        </aside>
      </form>
    </>
  );
}

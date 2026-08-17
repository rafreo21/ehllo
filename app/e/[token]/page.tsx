"use client";

import { useEffect, useState } from "react";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Download as DownloadSimpleIcon } from "react-feather";
import { ChevronDown as ChevronDownIcon } from "react-feather";
import { Copy as CopyIcon } from "react-feather";
import { Lock as LockKeyIcon } from "react-feather";
import { Mic as MicrophoneIcon } from "react-feather";
import { encounterFromSharedPayload, readEncounters, type Encounter } from "../../../lib/encounters";
import { buildAuthHref } from "../../../lib/auth/visitor-intent";
import { CLOUD_RECORDING_RETENTION_DAYS, formatRecordingAvailableUntil } from "../../../lib/recording-metadata";
import { Button, LinkButton } from "../../components/Button";
import { followUpDueDate } from "../../../lib/follow-up-templates";
import { BrandMark } from "../../components/BrandMark";
import { displayFollowUpTitle, FOLLOW_UP_CHANNELS, SELECTABLE_FOLLOW_UP_CHANNELS } from "../../../lib/follow-up-channels";
import "../../app/product.css";
import "../../app/flow.css";

const LOCAL_PREVIEW_AUDIO = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function buildLocalPreviewEncounter(): Encounter {
  const now = new Date();
  return {
    id: "local-preview-encounter",
    title: "Meeting with Alex Morgan",
    personName: "Alex Morgan",
    personEmail: "alex@example.com",
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
    durationSeconds: 12,
    consent: { confirmed: true, method: "verbal", confirmedAt: now.toISOString(), scriptVersion: "2026-07-26" },
    transcript: "",
    privateNotes: "",
    sharedSummary: "We aligned on the proposal, timing, and the next conversation.",
    recording: {
      id: "local-preview-recording",
      durationSeconds: 12,
      fileSize: 0,
      mimeType: "audio/wav",
      source: "recorded",
      retention: "never",
      expiresAt: null,
      createdAt: now.toISOString(),
      sharedAudioUrl: LOCAL_PREVIEW_AUDIO,
      cloudExpiresAt: new Date(now.getTime() + CLOUD_RECORDING_RETENTION_DAYS * 86_400_000).toISOString(),
    },
    actions: [{ id: "local-preview-action", title: "Review the proposal before Friday", channel: "email", owner: "guest", dueAt: "Friday", status: "open" }],
    participants: [],
    status: "shared",
    shareToken: "preview",
  };
}

export default function GuestEncounterPage() {
  const [encounter, setEncounter] = useState<Encounter | null | undefined>(undefined);
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpChannel, setFollowUpChannel] = useState<Encounter["actions"][number]["channel"]>("email");
  const [followUpDueAt, setFollowUpDueAt] = useState(followUpDueDate(1));
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [recordingDownloading, setRecordingDownloading] = useState(false);
  const [recordingDownloadError, setRecordingDownloadError] = useState("");
  const [guestSummaryTab, setGuestSummaryTab] = useState<"recap" | "transcript">("recap");
  const [copiedGuestSummaryField, setCopiedGuestSummaryField] = useState<"recap" | "transcript" | null>(null);

  const setEncounterPayload = (nextEncounter: Encounter | null | undefined) => {
    setEncounter(nextEncounter);
  };

  useEffect(() => {
    const token = window.location.pathname.split("/").filter(Boolean).at(-1) || "";
    if (token === "preview" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      void Promise.resolve().then(() => setEncounterPayload(buildLocalPreviewEncounter()));
      return;
    }
    void fetch(`/api/encounters/share/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (response.ok) {
          const payload = await response.json() as { encounter?: Record<string, unknown> };
          if (payload.encounter) {
            setEncounterPayload(encounterFromSharedPayload(payload.encounter) ?? null);
            return;
          }
        }
        setEncounterPayload(
          readEncounters().find((item) => item.shareToken === token && item.status === "shared") ?? null,
        );
      })
      .catch(() => {
        setEncounterPayload(
          readEncounters().find((item) => item.shareToken === token && item.status === "shared") ?? null,
        );
      });
  }, []);

  if (encounter === undefined) {
    return (
      <main className="guest-page" aria-busy="true" aria-label="Loading shared meeting">
        <section className="guest-panel guest-panel-loading">
          <div className="guest-loading-line guest-loading-brand" />
          <div className="guest-loading-line guest-loading-label" />
          <div className="guest-loading-line guest-loading-title" />
          <div className="guest-loading-line guest-loading-copy" />
          <div className="guest-loading-block" />
        </section>
      </main>
    );
  }
  if (!encounter) return <main className="guest-page"><section className="guest-panel guest-panel-empty"><span className="guest-empty-icon"><LockKeyIcon size={28} /></span><span className="guest-eyebrow">Private meeting record</span><h1>This link is no longer available.</h1><p>Ask the person who shared it to approve the record or send you a new secure link.</p><LinkButton href="/">Go to ehllo</LinkButton></section></main>;

  async function downloadRecording(url: string, filename: string) {
    if (recordingDownloading) return;
    setRecordingDownloading(true);
    setRecordingDownloadError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("recording download failed");
      const blob = await response.blob();
      const extension = blob.type.includes("webm") ? "webm"
        : blob.type.includes("ogg") ? "ogg"
        : blob.type.includes("mpeg") || blob.type.includes("mp3") ? "mp3"
        : blob.type.includes("wav") ? "wav"
        : "m4a";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${filename}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      setRecordingDownloadError("Could not download the recording. Try again while it is still available online.");
    } finally {
      setRecordingDownloading(false);
    }
  }

  async function commitFollowUp() {
    if (!encounter || followUpSubmitting) return;
    const note = displayFollowUpTitle(followUpNote.trim(), followUpChannel);
    setFollowUpSubmitting(true);
    setFollowUpError("");
    if (encounter.shareToken === "preview" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      setEncounter({ ...encounter, guestFollowUp: { committedAt: new Date().toISOString(), note, channel: followUpChannel, dueAt: followUpDueAt || undefined } });
      setFollowUpSubmitting(false);
      return;
    }
    try {
      const response = await fetch(`/api/encounters/share/${encodeURIComponent(encounter.shareToken)}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, channel: followUpChannel, dueAt: followUpDueAt || null }),
      });
      const payload = await response.json() as { guestFollowUp?: Encounter["guestFollowUp"]; error?: string };
      if (!response.ok || !payload.guestFollowUp) {
        setFollowUpError(payload.error || "Could not record your follow-up. Try again.");
        return;
      }
      setEncounter({ ...encounter, guestFollowUp: payload.guestFollowUp });
    } catch {
      setFollowUpError("Could not record your follow-up. Check your connection and try again.");
    } finally {
      setFollowUpSubmitting(false);
    }
  }

  const sharedRecordingUrl = encounter.recording?.sharedAudioUrl
    ? (encounter.recording.sharedAudioUrl.startsWith("http") || encounter.recording.sharedAudioUrl.startsWith("data:")
      ? encounter.recording.sharedAudioUrl
      : `${window.location.origin}${encounter.recording.sharedAudioUrl}`)
    : null;
  const recordingAvailableUntil = formatRecordingAvailableUntil(encounter.recording?.cloudExpiresAt);

  function copyGuestSummaryField(field: "recap" | "transcript", value: string) {
    void navigator.clipboard.writeText(value || "");
    setCopiedGuestSummaryField(field);
    window.setTimeout(() => {
      setCopiedGuestSummaryField((current) => (current === field ? null : current));
    }, 1200);
  }

  return (
    <main className="guest-page">
      <section className="guest-panel">
        <header className="guest-topbar">
          <a className="guest-brand" href="/"><BrandMark size={36} />ehllo</a>
          <span className="guest-secure"><LockKeyIcon size={14} />Private link</span>
        </header>
        <div className="guest-hero">
          <span className="guest-eyebrow">Shared with you</span>
          <h1>{encounter.title}</h1>
          <p>A reviewed meeting record{encounter.personName ? ` from your conversation with ${encounter.personName}` : " from a recent conversation"}.</p>
        </div>
        {sharedRecordingUrl ? (
          <article className="guest-recording">
            <header>
              <span><MicrophoneIcon size={19} /></span>
              <div><h2>Meeting recording</h2><p>Listen back or save a copy before it expires.</p></div>
            </header>
            <audio controls preload="metadata" src={sharedRecordingUrl} />
            <div className="guest-recording-actions">
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  loading={recordingDownloading}
                  onClick={() => void downloadRecording(sharedRecordingUrl, `${encounter.title.replace(/[^\w\- ]+/g, "").trim() || "ehllo"}-recording`)}
                >
                  <DownloadSimpleIcon size={16} />
                  {recordingDownloading ? "Preparing…" : "Save to my device"}
                </Button>
              </div>
              <p>
                {recordingAvailableUntil ? (
                  <>Available online until <strong>{recordingAvailableUntil}</strong>. Download it to keep a copy after that.</>
                ) : (
                  <>Available online for {CLOUD_RECORDING_RETENTION_DAYS} days. Download it to keep a copy on your phone.</>
                )}
              </p>
            </div>
            {recordingDownloadError ? <small className="guest-form-error" role="alert">{recordingDownloadError}</small> : null}
          </article>
        ) : (
          <article className="guest-recording guest-recording-expired">
            <header><span><MicrophoneIcon size={19} /></span><div><h2>Recording expired</h2><p>The audio is no longer online, but the shared meeting record remains available below.</p></div></header>
          </article>
        )}
        <div className="guest-content-grid">
          <article className="guest-summary">
            <span>Meeting summary</span>
            <h2>What you agreed</h2>
            <div className="review-tabs" role="tablist" aria-label="Meeting recap and transcript">
              <button type="button" role="tab" aria-selected={guestSummaryTab === "recap"} className={guestSummaryTab === "recap" ? "active" : ""} onClick={() => setGuestSummaryTab("recap")}>
                Recap
              </button>
              <button type="button" role="tab" aria-selected={guestSummaryTab === "transcript"} className={guestSummaryTab === "transcript" ? "active" : ""} onClick={() => setGuestSummaryTab("transcript")}>
                Transcript
              </button>
            </div>
            {guestSummaryTab === "recap" ? (
              <div className="guest-summary-tab-content">
                <p className="guest-summary-text">{encounter.sharedSummary || "The shared summary is still being prepared."}</p>
                <button
                  type="button"
                  className="review-textfield-copy"
                  onClick={() => copyGuestSummaryField("recap", encounter.sharedSummary || "The shared summary is still being prepared.")}
                  aria-label="Copy recap"
                >
                  {copiedGuestSummaryField === "recap" ? <CheckCircleIcon size={15} /> : <CopyIcon size={15} />}
                </button>
              </div>
            ) : (
              <div className="guest-summary-tab-content">
                <p className="guest-summary-transcript">{encounter.transcript || "No transcript has been shared with you yet."}</p>
                <button
                  type="button"
                  className="review-textfield-copy"
                  onClick={() => copyGuestSummaryField("transcript", encounter.transcript || "No transcript has been shared with you yet.")}
                  aria-label="Copy transcript"
                >
                  {copiedGuestSummaryField === "transcript" ? <CheckCircleIcon size={15} /> : <CopyIcon size={15} />}
                </button>
              </div>
            )}
          </article>
        </div>
        <section className="guest-follow-up">
          <span>Your next step</span><h2>What will you do next?</h2>
          {encounter.guestFollowUp?.committedAt ? (
            <article><CheckCircleIcon size={24} /><div><strong>Your next step was shared with the meeting host.</strong>{encounter.guestFollowUp.note ? <small>{encounter.guestFollowUp.note}</small> : null}<small>{encounter.guestFollowUp.dueAt ? `Date: ${encounter.guestFollowUp.dueAt} · ` : ""}{encounter.guestFollowUp.channel ? FOLLOW_UP_CHANNELS.find((item) => item.id === encounter.guestFollowUp?.channel)?.label || encounter.guestFollowUp.channel : "Follow-up"}</small></div></article>
          ) : (
            <>
              <div className="guest-actions-empty">
                <CheckCircleIcon size={20} />
                <p>No actions yet. Add one, and it will appear in the host&apos;s follow-up list for this meeting.</p>
              </div>
              <div className="guest-follow-up-fields">
                <label>How will you follow up?
                  <span className="guest-follow-up-select-wrap">
                    <select value={followUpChannel} onChange={(event) => setFollowUpChannel(event.target.value as Encounter["actions"][number]["channel"])}>
                      {SELECTABLE_FOLLOW_UP_CHANNELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                    <ChevronDownIcon className="guest-follow-up-chevron" size={14} aria-hidden="true" />
                  </span>
                </label>
                <label>Date
                  <input type="date" value={followUpDueAt} onChange={(event) => setFollowUpDueAt(event.target.value)} />
                </label>
              </div>
              <label className="guest-follow-up-label" htmlFor="guest-follow-up-note">
                What do you need to do? (optional)
              </label>
              <textarea
                id="guest-follow-up-note"
                value={followUpNote}
                onChange={(event) => setFollowUpNote(event.target.value)}
                placeholder="For example: I’ll send the proposal on Friday."
                rows={2}
                maxLength={280}
              />
              <small className="guest-follow-up-help">Be specific enough to remember later. For example, include what you will send, who you will contact, or when you will respond.</small>
              {followUpError ? <small className="guest-form-error">{followUpError}</small> : null}
              <Button
                type="button"
                variant="primary"
                size="normal"
                loading={followUpSubmitting}
                disabled={followUpSubmitting}
                onClick={() => void commitFollowUp()}
              >
                {followUpSubmitting ? "Sharing…" : "Share my next step"}
              </Button>
            </>
          )}
        </section>
        <div className="guest-claim">
          <div><span>Continue in ehllo</span><strong>Keep this relationship moving.</strong><p>Create your private workspace to claim actions, receive reminders, and add your own notes.</p></div>
          <LinkButton className="guest-create-account" href={buildAuthHref({ intent: "visitor", shareToken: encounter.shareToken })}>Create account <ArrowRightIcon size={16} /></LinkButton>
        </div>
        <small className="guest-privacy"><LockKeyIcon size={14} />Private notes and the full transcript stay with the host. This page shows the shared summary{sharedRecordingUrl ? " and meeting recording" : ""} only.</small>
      </section>
    </main>
  );
}

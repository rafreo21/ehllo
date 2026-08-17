"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Copy as CopyIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Eye as EyeIcon } from "react-feather";
import { Lock as LockKeyIcon } from "react-feather";
import { Edit3 as NotePencilIcon } from "react-feather";
import { Edit2 as PencilSimpleIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { ActionDoButton } from "./ActionDoButton";
import { Button } from "./Button";
import { PageSkeleton } from "./AsyncState";
import { TextAreaField, SelectField, TextField } from "./FormField";
import { buildActionLinkContext, buildRequestEmailLink, channelLabel, resolveActionLink, type ActionLinkContext } from "../../lib/action-links";
import { findContactById } from "../../lib/contacts";
import { encounterToApiBody, formatDuration, readEncounters, updateEncounter, writeEncounter, type Encounter, type EncounterAction } from "../../lib/encounters";
import { supportsOutboundDraft } from "../../lib/outbound-habit";
import { readLocalRecording } from "../../lib/local-recordings";
import { uploadEncounterRecording } from "../../lib/recording-upload";
import {
  CLOUD_RECORDING_RETENTION_DAYS,
  formatRecordingAvailableUntil,
  hasActiveCloudRecording,
  isCloudRecordingExpired,
} from "../../lib/recording-metadata";
import { formatMeetingEmailDate, recordingShareMailtoHref } from "../../lib/recording-email";
import { renameSpeakerAssignees, renameTranscriptSpeakers, transcriptSpeakerLabels } from "../../lib/speaker-labels";
import { applyFollowUpTransition, canTransitionFollowUp } from "../../lib/follow-up-lifecycle";

type UploadStatus = "idle" | "uploading" | "uploaded" | "failed";
const ACTIONS_PREVIEW_SIZE = 3;

export function EncounterDrawerView({ encounterId }: { encounterId: string }) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reviewTab, setReviewTab] = useState<"recap" | "transcript" | "notes">("recap");
  const [editingActionId, setEditingActionId] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState("");
  const [uploadRetryable, setUploadRetryable] = useState(true);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  const [localRecordingMimeType, setLocalRecordingMimeType] = useState("audio/mp4");
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState("");
  const [showAllActions, setShowAllActions] = useState(false);
  const serverUpdatedAtRef = useRef("");
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setEncounter(null);
    setReviewTab("recap");
    setEditingActionId("");
    setShowAllActions(false);
    void fetch(`/api/encounters/${encounterId}`)
      .then(async (response) => {
        if (response.ok) {
          const payload = await response.json() as { encounter?: Encounter };
          if (payload.encounter) {
            serverUpdatedAtRef.current = payload.encounter.updatedAt || "";
            writeEncounter(payload.encounter);
            setEncounter(payload.encounter);
            return;
          }
        }
        setEncounter(readEncounters().find((item) => item.id === encounterId) ?? null);
      })
      .catch(() => {
        setEncounter(readEncounters().find((item) => item.id === encounterId) ?? null);
      })
      .finally(() => setLoading(false));
  }, [encounterId]);

  useEffect(() => {
    if (!encounterId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void readLocalRecording(encounterId).then((local) => {
      if (cancelled || !local) return;
      objectUrl = URL.createObjectURL(local.blob);
      setLocalAudioUrl(objectUrl);
      setLocalRecordingMimeType(local.metadata.mimeType || local.blob.type || "audio/mp4");
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [encounterId]);

  useEffect(() => {
    if (!encounter || !localAudioUrl) return;
    if (hasActiveCloudRecording(encounter.recording)) {
      void Promise.resolve().then(() => setUploadStatus("uploaded"));
      return;
    }
    let cancelled = false;
    void (async () => {
      setUploadStatus("uploading");
      setUploadError("");
      try {
        const local = await readLocalRecording(encounter.id);
        if (cancelled || !local) {
          setUploadStatus("idle");
          return;
        }
        const uploaded = await uploadEncounterRecording(encounter.id, local.blob, local.metadata.mimeType);
        if (cancelled) return;
        const next = { ...encounter, recording: uploaded };
        writeEncounter(next);
        setEncounter(next);
        setUploadStatus("uploaded");
        await syncEncounter(next);
      } catch (caught) {
        if (cancelled) return;
        setUploadStatus("failed");
        setUploadRetryable((caught as Error & { retryable?: boolean })?.retryable !== false);
        setUploadError(caught instanceof Error ? caught.message : "Could not upload recording for guests.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter?.id, localAudioUrl]);

  async function retryUpload() {
    if (!encounter) return;
    const local = await readLocalRecording(encounter.id);
    if (!local) {
      setUploadError("No local recording found in this browser.");
      setUploadStatus("failed");
      return;
    }
    setUploadStatus("uploading");
    setUploadError("");
    try {
      const uploaded = await uploadEncounterRecording(encounter.id, local.blob, local.metadata.mimeType);
      const next = { ...encounter, recording: uploaded };
      writeEncounter(next);
      setEncounter(next);
      setUploadStatus("uploaded");
      await syncEncounter(next);
      setMessage("Recording uploaded for guest sharing.");
    } catch (caught) {
      setUploadStatus("failed");
      setUploadRetryable((caught as Error & { retryable?: boolean })?.retryable !== false);
      setUploadError(caught instanceof Error ? caught.message : "Could not upload recording for guests.");
    }
  }

  async function syncEncounter(next: Encounter) {
    writeEncounter(next);
    const generation = saveGenerationRef.current;
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (generation !== saveGenerationRef.current) return;
      try {
        const response = await fetch("/api/encounters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...encounterToApiBody(next),
            expectedUpdatedAt: serverUpdatedAtRef.current || next.updatedAt,
          }),
        });
        const payload = await response.json().catch(() => ({})) as {
          updatedAt?: string;
          error?: string;
          conflict?: boolean;
        };
        if (response.status === 409 && payload.conflict) {
          saveGenerationRef.current += 1;
          const latestResponse = await fetch(`/api/encounters/${encodeURIComponent(next.id)}`, { cache: "no-store" });
          const latestPayload = await latestResponse.json().catch(() => ({})) as { encounter?: Encounter };
          if (latestResponse.ok && latestPayload.encounter) {
            serverUpdatedAtRef.current = latestPayload.encounter.updatedAt || "";
            writeEncounter(latestPayload.encounter);
            setEncounter(latestPayload.encounter);
          }
          setMessage(payload.error || "This meeting changed on another device. We loaded the latest version; redo your change if it is still needed.");
          return;
        }
        if (!response.ok) {
          setMessage(payload.error || "Your change is saved in this browser but has not synced yet.");
          return;
        }
        if (payload.updatedAt) {
          serverUpdatedAtRef.current = payload.updatedAt;
          setEncounter((current) => {
            if (!current) return current;
            const revised = { ...current, updatedAt: payload.updatedAt };
            writeEncounter(revised);
            return revised;
          });
        }
      } catch {
        setMessage("Your change is saved in this browser but has not synced yet.");
      }
    });
    await saveChainRef.current;
  }

  function patch(updater: (current: Encounter) => Encounter) {
    const updated = updateEncounter(encounterId, updater);
    if (updated) void syncEncounter(updated);
    setEncounter(updated);
  }

  function participantName(participantId?: string) {
    if (!participantId) return encounter?.personName || "Guest";
    return encounter?.participants?.find((person) => person.id === participantId)?.name
      || encounter?.personName
      || "Guest";
  }

  function actionOwnerLabel(action: EncounterAction) {
    const person = action.participantId ? participantName(action.participantId) : "";
    if (action.owner === "me") return person ? `You → ${person}` : "You";
    return person || action.assigneeName || encounter?.personName || "Guest";
  }

  function renderActionCta(action: EncounterAction, context: ActionLinkContext) {
    const active = action.owner === "me" && action.status !== "completed" && action.status !== "proposed";
    const primary = resolveActionLink(action, context);
    if (action.channel === "email" || action.channel === "send") {
      return (
        <button
          type="button"
          className="action-edit"
          aria-label={`Email ${action.title}`}
          disabled={!active}
          onClick={() => window.open(primary.href, "_blank", "noreferrer")}
        ><EnvelopeSimpleIcon size={16} /></button>
      );
    }
    if (primary.unavailableReason && context.personEmail) {
      const label = channelLabel(action.channel);
      const href = buildRequestEmailLink(context, action.channel);
      return (
        <button
          type="button"
          className="action-edit"
          aria-label={`Request ${label} via email for ${action.title}`}
          disabled={!active}
          onClick={() => window.open(href, "_blank", "noreferrer")}
        ><EnvelopeSimpleIcon size={16} /></button>
      );
    }
    if (active) return <ActionDoButton action={action} context={context} showSecondary />;
    return (
      <button type="button" className="action-edit" aria-label={`${action.title} action`} disabled>
        <EnvelopeSimpleIcon size={16} />
      </button>
    );
  }

  async function copyGuestLink() {
    if (!encounter) return;
    if (encounter.status !== "shared") {
      setMessage("Approve the shared record before copying the guest link.");
      return;
    }
    const url = `${window.location.origin}/e/${encounter.shareToken}`;
    await navigator.clipboard.writeText(url);
    setMessage("Guest link copied.");
  }

  async function copyFieldValue(field: string, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField((current) => (current === field ? "" : current)), 2000);
  }

  function confirmReview() {
    if (!encounter || encounter.status !== "draft") return;
    patch((current) => ({ ...current, status: "reviewed" }));
    setMessage("Review confirmed. Your follow-ups are now active.");
  }

  function approveAndShare() {
    if (!encounter) return;
    if (!encounter.sharedSummary.trim()) {
      setMessage("Add a shared summary before approving the guest view.");
      return;
    }
    const needsCloud = Boolean(localAudioUrl || encounter.recording || encounter.durationSeconds > 0);
    if (needsCloud && !hasActiveCloudRecording(encounter.recording) && uploadStatus !== "uploaded") {
      setMessage("Upload the recording for guests first, or retry the upload below.");
      return;
    }
    patch((current) => ({ ...current, status: "shared" }));
    setMessage("Shared view is ready. Nothing has been sent automatically.");
  }

  if (loading) {
    return (
      <div className="followup-drawer-body">
        <PageSkeleton rows={4} />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="followup-drawer-body">
        <p className="connections-count">This meeting could not be found.</p>
      </div>
    );
  }

  const participants = encounter.participants ?? [];
  const actions = encounter.actions ?? [];
  const speakerLabels = transcriptSpeakerLabels(encounter.transcript);
  const speakerCandidates = Array.from(new Set([
    "Me",
    encounter.personName,
    ...participants.map((person) => person.name),
  ].map((name) => name.trim()).filter(Boolean)));
  const guestUrl = `${window.location.origin}/e/${encounter.shareToken}`;
  const guestCommitments = encounter.guestFollowUps?.length
    ? encounter.guestFollowUps
    : encounter.guestFollowUp
      ? [encounter.guestFollowUp]
      : [];
  const cloudExpired = isCloudRecordingExpired(encounter.recording);
  const cloudAvailableUntil = formatRecordingAvailableUntil(encounter.recording?.cloudExpiresAt);
  const recordingEmailHref = recordingShareMailtoHref({
    title: encounter.title,
    personName: encounter.personName,
    personEmail: encounter.personEmail,
    guestUrl,
    sharedSummary: encounter.sharedSummary,
    meetingDate: formatMeetingEmailDate(encounter.startedAt),
    cloudExpired,
  });
  const showEmailRecording = Boolean(localAudioUrl && (cloudExpired || uploadStatus === "failed" || !hasActiveCloudRecording(encounter.recording)));
  const openActions = actions.filter((action) => action.status !== "completed");
  const peopleCount = participants.length || (encounter.personName ? 1 : 0);
  const isShared = encounter.status === "shared";
  const isReviewed = encounter.status === "reviewed" || isShared;

  return (
    <div className="followup-drawer-body encounter-drawer-view">
      <header className="review-heading">
        <div><h1>{encounter.personName || encounter.title}</h1><p>{encounter.personName && encounter.title ? encounter.title : encounter.personName || "Unlinked person"} · {formatDuration(encounter.durationSeconds)}</p></div>
        {encounter.status === "shared" && <CheckCircleIcon size={32} />}
      </header>

      <p className="review-status-line" aria-label="Meeting review summary">
        <span>{peopleCount} {peopleCount === 1 ? "person" : "people"}</span>
        <span>{openActions.length} follow-up{openActions.length === 1 ? "" : "s"}{isReviewed ? "" : " (pending)"}</span>
        <span>{isShared ? "Guest view shared" : isReviewed ? "Reviewed · private" : "Pending review"}</span>
      </p>

      {!isReviewed ? (
        <section className="review-section review-primary-section">
          <header><div><h2>Follow-ups are pending</h2><p>Nothing above is active yet. Confirm your review to turn these follow-ups on. Sharing a guest link is separate and optional.</p></div></header>
          <Button fullWidth onClick={confirmReview}>Confirm review</Button>
        </section>
      ) : null}

      <section className="review-section">
        <div className="review-tabs" role="tablist" aria-label="Meeting recap, transcript, and private notes">
          <button type="button" role="tab" aria-selected={reviewTab === "recap"} className={reviewTab === "recap" ? "active" : ""} onClick={() => setReviewTab("recap")}>
            Recap
          </button>
          <button type="button" role="tab" aria-selected={reviewTab === "transcript"} className={reviewTab === "transcript" ? "active" : ""} onClick={() => setReviewTab("transcript")}>
            Transcript
          </button>
          <button type="button" role="tab" aria-selected={reviewTab === "notes"} className={reviewTab === "notes" ? "active" : ""} onClick={() => setReviewTab("notes")}>
            Private notes
          </button>
        </div>
        {reviewTab === "recap" ? (
          <div className="review-tab-panel" role="tabpanel">
            <div className="review-textfield-wrap">
              <TextAreaField
                label="Shared summary"
                hint="Participant can see this"
                placeholder="No summary written for this encounter yet."
                style={{ height: 140, resize: "none", overflowY: "auto", fontSize: 14, lineHeight: 1.5 }}
                value={encounter.sharedSummary}
                onChange={(event) => patch((current) => ({ ...current, sharedSummary: event.target.value }))}
              />
              <button type="button" className="review-textfield-copy" onClick={() => void copyFieldValue("summary", encounter.sharedSummary)} aria-label="Copy shared summary">
                {copiedField === "summary" ? <CheckCircleIcon size={15} /> : <CopyIcon size={15} />}
              </button>
            </div>
            <span className="review-tab-badge"><EyeIcon size={13} />This is what participants will see after you approve the guest view.</span>
          </div>
        ) : reviewTab === "transcript" ? (
          <div className="review-tab-panel review-details-content" role="tabpanel">
            {localAudioUrl ? (
              <article className="review-recording-detail">
                <strong>Recording</strong>
                <audio controls preload="metadata" src={localAudioUrl} />
              </article>
            ) : null}
            {speakerLabels.length ? (
              <div className="speaker-identity-editor">
                <div>
                  <strong>Identify speakers</strong>
                  <small>Confirm who each detected voice belongs to before you review the summary.</small>
                </div>
                {speakerLabels.map((label) => (
                  <label key={label}>
                    <span>{label}</span>
                    <select
                      value={speakerNames[label] || ""}
                      onChange={(event) => setSpeakerNames((current) => ({ ...current, [label]: event.target.value }))}
                    >
                      <option value="">Choose a person</option>
                      {speakerCandidates.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
                    </select>
                  </label>
                ))}
                <Button
                  variant="secondary"
                  disabled={!speakerLabels.every((label) => speakerNames[label])}
                  onClick={() => {
                    patch((current) => ({
                      ...current,
                      transcript: renameTranscriptSpeakers(current.transcript, speakerNames),
                      actions: renameSpeakerAssignees(current.actions ?? [], speakerNames, current.participants ?? []),
                    }));
                    setMessage("Speaker names applied to the transcript and follow-up owners.");
                  }}
                >Apply speaker names</Button>
              </div>
            ) : null}
            <div className="review-textfield-wrap">
              <TextAreaField
                label="Full transcript"
                hint="Private"
                placeholder="No transcript captured for this encounter."
                style={{ height: 140, resize: "none", overflowY: "auto", fontSize: 14, lineHeight: 1.5 }}
                value={encounter.transcript}
                onChange={(event) => patch((current) => ({ ...current, transcript: event.target.value }))}
              />
              <button type="button" className="review-textfield-copy" onClick={() => void copyFieldValue("transcript", encounter.transcript)} aria-label="Copy full transcript">
                {copiedField === "transcript" ? <CheckCircleIcon size={15} /> : <CopyIcon size={15} />}
              </button>
            </div>
            <span className="review-tab-badge"><LockKeyIcon size={13} />Recording, transcript, and speaker names — only you can see this.</span>
          </div>
        ) : (
          <div className="review-tab-panel review-details-content" role="tabpanel">
            <div className="review-textfield-wrap">
              <TextAreaField
                label="Private notes"
                hint="Only you"
                placeholder="No private notes added for this encounter yet."
                style={{ height: 140, resize: "none", overflowY: "auto", fontSize: 14, lineHeight: 1.5 }}
                value={encounter.privateNotes}
                onChange={(event) => patch((current) => ({ ...current, privateNotes: event.target.value }))}
              />
              <button type="button" className="review-textfield-copy" onClick={() => void copyFieldValue("notes", encounter.privateNotes)} aria-label="Copy private notes">
                {copiedField === "notes" ? <CheckCircleIcon size={15} /> : <CopyIcon size={15} />}
              </button>
            </div>
            <span className="review-tab-badge"><NotePencilIcon size={13} />Only you can see this.</span>
          </div>
        )}
      </section>

      <section className="review-section">
        <div className="connections-section-head">
          <h2>Follow-up</h2>
        </div>
        {guestCommitments.length ? (
          <div className="guest-response-list">
            {guestCommitments.map((commitment, index) => (
              <article key={commitment.id || `${commitment.committedAt}-${index}`}>
                <CheckCircleIcon size={20} />
                <div><strong>{commitment.note || "They confirmed they will follow up."}</strong><small>{commitment.guestName || participantName(commitment.participantId) || "Guest"}{commitment.channel ? ` · ${commitment.channel}` : ""}{commitment.dueAt ? ` · due ${commitment.dueAt}` : ""} · shared {new Date(commitment.committedAt).toLocaleDateString()}</small></div>
              </article>
            ))}
          </div>
        ) : null}
        <div className="action-list">
          {(showAllActions ? actions : actions.slice(0, ACTIONS_PREVIEW_SIZE)).map((action) => {
            const actionContext = buildActionLinkContext(
              encounter,
              encounter.contactId ? findContactById(encounter.contactId) : null,
              action,
            );
            const toggleTarget = action.status === "completed" ? "open" : "completed";
            const canToggle = canTransitionFollowUp(action.status, toggleTarget);
            return <article key={action.id}>
              <button
                className={action.status === "completed" ? "action-check complete" : "action-check"}
                disabled={!canToggle}
                onClick={() => {
                  if (!canToggle) return;
                  patch((current) => ({
                    ...current,
                    actions: (current.actions ?? []).map((item) => item.id === action.id
                      ? applyFollowUpTransition(item, toggleTarget)
                      : item),
                  }));
                }}
                aria-label={action.status === "completed" ? "Mark open" : canToggle ? "Mark complete" : "Confirm review to activate this follow-up first"}
              ><CheckCircleIcon size={22} /></button>
              <div className="action-copy"><strong>{action.title}</strong><small>{actionOwnerLabel(action)}{action.dueAt ? ` · due ${action.dueAt}` : ""}</small></div>
              {editingActionId === action.id ? (
                <div className="action-inline-editor">
                  <SelectField
                    label="Owner"
                    value={action.owner === "me" ? "me" : action.participantId || "guest"}
                    onChange={(event) => {
                      const value = event.target.value;
                      const participant = participants.find((person) => person.id === value);
                      patch((current) => ({
                        ...current,
                        actions: (current.actions ?? []).map((item) => item.id !== action.id ? item : value === "me"
                          ? { ...item, owner: "me" }
                          : {
                            ...item,
                            owner: "guest",
                            participantId: participant?.id,
                            assigneeName: participant?.name || current.personName || "Guest",
                            assigneeEmail: participant?.email || item.assigneeEmail,
                          }),
                      }));
                    }}
                  >
                    <option value="me">Me</option>
                    {participants.length ? participants.map((person) => (
                      <option key={person.id} value={person.id}>{person.name || "Guest"}</option>
                    )) : <option value="guest">{encounter.personName || "Guest"}</option>}
                  </SelectField>
                  {action.owner === "me" && participants.length ? (
                    <SelectField
                      label="For person"
                      value={action.participantId || participants[0]?.id || ""}
                      onChange={(event) => {
                        const participant = participants.find((person) => person.id === event.target.value);
                        patch((current) => ({
                          ...current,
                          actions: (current.actions ?? []).map((item) => item.id === action.id
                            ? {
                              ...item,
                              participantId: participant?.id,
                              assigneeName: participant?.name,
                              assigneeEmail: participant?.email,
                            }
                            : item),
                        }));
                      }}
                    >
                      {participants.map((person) => (
                        <option key={person.id} value={person.id}>{person.name || "Guest"}</option>
                      ))}
                    </SelectField>
                  ) : null}
                  <TextField
                    label="Due date"
                    type="date"
                    value={action.dueAt || ""}
                    onChange={(event) => patch((current) => ({
                      ...current,
                      actions: (current.actions ?? []).map((item) => item.id === action.id
                        ? { ...item, dueAt: event.target.value }
                        : item),
                    }))}
                  />
                  <Button variant="secondary" onClick={() => setEditingActionId("")}>Done</Button>
                </div>
              ) : null}
              <button
                type="button"
                className="action-edit"
                aria-label={`Edit owner and due date for ${action.title}`}
                aria-expanded={editingActionId === action.id}
                onClick={() => setEditingActionId((current) => current === action.id ? "" : action.id)}
              ><PencilSimpleIcon size={16} /></button>
              {actionContext ? renderActionCta(action, actionContext) : null}
            </article>;
          })}
          {!actions.length && <p className="muted-copy">No follow-ups yet. Add one below if this meeting needs a next step.</p>}
        </div>
        {actions.length > ACTIONS_PREVIEW_SIZE ? (
          <Button size="small" variant="ghost" onClick={() => setShowAllActions((value) => !value)}>
            {showAllActions ? "Show less" : `View more (${actions.length - ACTIONS_PREVIEW_SIZE})`}
          </Button>
        ) : null}
      </section>

      <section className="share-rail">
        <span>{encounter.status === "shared" ? "Ready to share" : "Optional"}</span>
        <h2>{encounter.status === "shared" ? "The guest view is ready." : "Share when you're ready."}</h2>
        <p>{encounter.status === "shared" ? "Send the secure link yourself. Nothing is sent automatically." : `Creating a guest link also confirms your review, if you haven't already. Shared recordings remain online for ${CLOUD_RECORDING_RETENTION_DAYS} days.`}</p>
        {participants.length > 1 ? (
          participants.map((person) => (
            <div className="guest-card" key={person.id}><strong>{person.name || "Guest participant"}</strong><small>{person.email || "No email added"}</small></div>
          ))
        ) : (
          <div className="guest-card"><strong>{encounter.personName || "Guest participant"}</strong><small>{encounter.personEmail || "No email added"}</small></div>
        )}
        {uploadStatus === "uploading" ? <p className="muted-copy" role="status">Uploading recording for guest sharing…</p> : null}
        {uploadStatus === "uploaded" && cloudAvailableUntil && !cloudExpired ? (
          <p className="muted-copy">Guests can play or download until {cloudAvailableUntil}.</p>
        ) : null}
        {uploadStatus === "failed" ? (
          <>
            <p className="share-message" role="status">{uploadError || "Upload failed."}</p>
            {uploadRetryable ? <Button fullWidth variant="secondary" onClick={() => void retryUpload()}>Retry upload</Button> : null}
          </>
        ) : null}
        {encounter.status !== "shared" ? (
          <Button fullWidth onClick={approveAndShare}><CheckCircleIcon size={18} />Approve and create link</Button>
        ) : (
          <div className="share-rail-actions">
            <Button size="small" onClick={() => void copyGuestLink()}><CopyIcon size={16} />Copy guest link</Button>
            {encounter.personEmail ? (
              <a className="email-invite" href={recordingShareMailtoHref({
                title: encounter.title,
                personName: encounter.personName,
                personEmail: encounter.personEmail,
                guestUrl,
                sharedSummary: encounter.sharedSummary,
                meetingDate: formatMeetingEmailDate(encounter.startedAt),
                cloudExpired,
              })}><EnvelopeSimpleIcon size={16} />Email guest link</a>
            ) : null}
          </div>
        )}
        {showEmailRecording ? (
          <>
            <a className="email-invite" href={recordingEmailHref}><EnvelopeSimpleIcon size={18} />Email recording + details</a>
            <a className="email-invite" href={localAudioUrl ?? "#"} download={`${encounter.title.replace(/[^\w\- ]+/g, "").trim() || "ehllo"}-recording.${localRecordingMimeType.includes("wav") ? "wav" : "m4a"}`}>Download recording for attachment</a>
            <small>Email apps cannot attach files automatically. Download the recording, then attach it in your email draft.</small>
          </>
        ) : null}
        <small>{encounter.status === "shared" ? "Only the approved recap and participant follow-ups are visible." : "Keep this private by leaving it as a draft."}</small>
        {message && <p className="share-message" role="status">{message}</p>}
      </section>

    </div>
  );
}

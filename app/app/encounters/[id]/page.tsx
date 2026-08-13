"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { LockKeyIcon } from "@phosphor-icons/react/dist/csr/LockKey";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { ActionDoButton } from "../../../components/ActionDoButton";
import { OutboundDraftPanel } from "../../../components/OutboundDraftPanel";
import { Button, LinkButton } from "../../../components/Button";
import { TextAreaField, SelectField, TextField } from "../../../components/FormField";
import { buildActionLinkContext, channelLabel } from "../../../../lib/action-links";
import { findContactById } from "../../../../lib/contacts";
import { encounterToApiBody, formatDuration, readEncounters, updateEncounter, writeEncounter, type Encounter, type EncounterAction } from "../../../../lib/encounters";
import { supportsOutboundDraft } from "../../../../lib/outbound-habit";
import { readLocalRecording } from "../../../../lib/local-recordings";
import { uploadEncounterRecording } from "../../../../lib/recording-upload";
import {
  CLOUD_RECORDING_RETENTION_DAYS,
  formatRecordingAvailableUntil,
  hasActiveCloudRecording,
  isCloudRecordingExpired,
} from "../../../../lib/recording-metadata";
import { formatMeetingEmailDate, recordingShareMailtoHref } from "../../../../lib/recording-email";
import { renameSpeakerAssignees, renameTranscriptSpeakers, transcriptSpeakerLabels } from "../../../../lib/speaker-labels";
import { displayFollowUpTitle } from "../../../../lib/follow-up-channels";
import { applyFollowUpTransition, canTransitionFollowUp } from "../../../../lib/follow-up-lifecycle";

type UploadStatus = "idle" | "uploading" | "uploaded" | "failed";

export default function EncounterReviewPage() {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [encounterId, setEncounterId] = useState("");
  const [newAction, setNewAction] = useState({ title: "", owner: "me" as "me" | "guest", participantId: "", dueAt: "", channel: "email" as EncounterAction["channel"] });
  const [newActionDetailOpen, setNewActionDetailOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewTab, setReviewTab] = useState<"recap" | "details">("recap");
  const [actionComposerOpen, setActionComposerOpen] = useState(false);
  const [editingActionId, setEditingActionId] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState("");
  const [uploadRetryable, setUploadRetryable] = useState(true);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  const [localRecordingMimeType, setLocalRecordingMimeType] = useState("audio/mp4");
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const serverUpdatedAtRef = useRef("");
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const id = window.location.pathname.split("/").filter(Boolean).at(-1) || "";
      const draftValue = new URLSearchParams(window.location.search).get("draft");
      if (draftValue) {
        try {
          const draft = JSON.parse(draftValue) as Encounter;
          writeEncounter(draft);
          setEncounterId(draft.id);
          setEncounter(draft);
          window.history.replaceState({}, "", `/app/encounters/${draft.id}`);
          return;
        } catch {}
      }
      setEncounterId(id);
      void fetch(`/api/encounters/${id}`)
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
        setEncounter(readEncounters().find((item) => item.id === id) ?? null);
      })
      .catch(() => {
        setEncounter(readEncounters().find((item) => item.id === id) ?? null);
      });
    });
  }, []);

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

  function addAction() {
    patch((current) => {
      const participant = current.participants?.find((person) => person.id === newAction.participantId)
        ?? current.participants?.[0];
      return {
        ...current,
        actions: [...(current.actions ?? []), {
        id: crypto.randomUUID(),
        title: displayFollowUpTitle(newAction.title, newAction.channel),
        owner: newAction.owner,
        participantId: participant?.id,
        assigneeName: participant?.name,
        assigneeEmail: participant?.email,
        dueAt: newAction.dueAt,
        channel: newAction.channel,
        // A follow-up added before review is confirmed is still just a
        // proposal, same as the ones suggested from the transcript.
        status: current.status === "draft" ? "proposed" : "open",
      }],
      };
    });
    setNewAction({ title: "", owner: "me", participantId: "", dueAt: "", channel: "email" });
    setActionComposerOpen(false);
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

  useAppShellChrome({ backHref: "/app" });

  if (!encounter) {
    return <div className="empty-state"><div><h2>Encounter not found</h2><p>This local encounter may have been removed or created in another browser.</p><LinkButton href="/app">Back home</LinkButton></div></div>;
  }

  // Encounters created before multi-person capture do not have these arrays.
  // Keep their review pages usable while treating them as single-person records.
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
    <>
      <div className="review-layout">
        <main className="review-main">
          <header className="review-heading">
            <div><h1>{encounter.personName || encounter.title}</h1><p>{encounter.personName && encounter.title ? encounter.title : encounter.personName || "Unlinked person"} · {formatDuration(encounter.durationSeconds)}</p></div>
            {encounter.status === "shared" && <CheckCircleIcon size={42} weight="fill" />}
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

          <section className="review-section review-primary-section review-tabs-section">
            <div className="review-tabs" role="tablist" aria-label="Meeting recap and details">
              <button type="button" role="tab" aria-selected={reviewTab === "recap"} className={reviewTab === "recap" ? "active" : ""} onClick={() => setReviewTab("recap")}>
                <ShareNetworkIcon size={16} weight="bold" />Recap
              </button>
              <button type="button" role="tab" aria-selected={reviewTab === "details"} className={reviewTab === "details" ? "active" : ""} onClick={() => setReviewTab("details")}>
                <LockKeyIcon size={16} weight="bold" />Details
              </button>
            </div>
            {reviewTab === "recap" ? (
              <div className="review-tab-panel" role="tabpanel">
                <p className="review-tab-hint">This is what participants will see after you approve the guest view.</p>
                <TextAreaField label="Shared summary" hint="Participant can see this" rows={4} value={encounter.sharedSummary} onChange={(event) => patch((current) => ({ ...current, sharedSummary: event.target.value }))} />
              </div>
            ) : (
              <div className="review-tab-panel review-details-content" role="tabpanel">
                <p className="review-tab-hint">Recording, transcript, speaker names, and private notes — only you can see this.</p>
                {localAudioUrl ? (
                  <article className="review-recording-detail">
                    <strong>Recording</strong>
                    <audio controls preload="metadata" src={localAudioUrl} />
                  </article>
                ) : null}
                {encounter.transcript.trim() ? (
                <>
                  <button type="button" className="review-transcript-toggle" onClick={() => setTranscriptOpen((value) => !value)} aria-expanded={transcriptOpen}>
                    <div><strong>Full transcript</strong><small>{transcriptOpen ? "Hide the raw transcript while you focus on what to share." : "Expand to edit the full transcript. Collapsed by default on review."}</small></div>
                    {transcriptOpen ? <CaretUpIcon size={16} weight="bold" /> : <CaretDownIcon size={16} weight="bold" />}
                  </button>
                  {transcriptOpen ? (
                    <>
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
                      <TextAreaField label="Full transcript" hint="Private" rows={8} value={encounter.transcript} onChange={(event) => patch((current) => ({ ...current, transcript: event.target.value }))} />
                    </>
                  ) : null}
                </>
              ) : (
                <p className="muted-copy">No transcript saved for this encounter.</p>
              )}
              <TextAreaField label="Private notes" hint="Only you" rows={4} value={encounter.privateNotes} onChange={(event) => patch((current) => ({ ...current, privateNotes: event.target.value }))} />
              </div>
            )}
          </section>

          <section className="review-section">
            <header><span><CheckCircleIcon size={20} weight="bold" /></span><div><h2>Follow-ups</h2><p>Confirm the owner and due date for each commitment.</p></div></header>
            {guestCommitments.length ? (
              <div className="guest-response-list">
                {guestCommitments.map((commitment, index) => (
                  <article key={commitment.id || `${commitment.committedAt}-${index}`}>
                    <CheckCircleIcon size={20} weight="fill" />
                    <div><strong>{commitment.note || "They confirmed they will follow up."}</strong><small>{commitment.guestName || participantName(commitment.participantId) || "Guest"}{commitment.channel ? ` · ${commitment.channel}` : ""}{commitment.dueAt ? ` · due ${commitment.dueAt}` : ""} · shared {new Date(commitment.committedAt).toLocaleDateString()}</small></div>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="action-list">
              {actions.map((action) => {
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
                  ><CheckCircleIcon size={22} weight={action.status === "completed" ? "fill" : "regular"} /></button>
                  <div className="action-copy"><strong>{action.title}</strong><small>{actionOwnerLabel(action)}{action.dueAt ? ` · due ${action.dueAt}` : ""} · {channelLabel(action.channel)}</small></div>
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
                  ><PencilSimpleIcon size={17} weight="bold" />Edit</button>
                  {actionContext && <ActionDoButton action={action} context={actionContext} showSecondary />}
                  {actionContext && action.owner === "me" && supportsOutboundDraft(action.channel) ? (
                    <OutboundDraftPanel
                      compact
                      encounter={encounter}
                      action={action}
                      context={actionContext}
                      contact={encounter.contactId ? findContactById(encounter.contactId) : null}
                      onActionChange={(next) => patch((current) => ({
                        ...current,
                        actions: (current.actions ?? []).map((item) => item.id === next.id ? next : item),
                      }))}
                    />
                  ) : null}
                </article>;
              })}
              {!actions.length && <p className="muted-copy">No follow-ups yet. Add one below if this meeting needs a next step.</p>}
            </div>
            <button
              type="button"
              className="review-add-action-toggle"
              onClick={() => setActionComposerOpen((value) => !value)}
              aria-expanded={actionComposerOpen}
            >
              <span><PlusIcon size={16} weight="bold" />Add another follow-up</span>
              {actionComposerOpen ? <CaretUpIcon size={16} weight="bold" /> : <CaretDownIcon size={16} weight="bold" />}
            </button>
            {actionComposerOpen ? <div className="new-action">
              <div className="quick-follow-up-owner">
                <small className="block text-[11px] font-extrabold uppercase tracking-wide text-[#8391a5]">Owner</small>
                <div className="flow-heading-actions" style={{ marginTop: 8 }}>
                  <Button type="button" size="small" variant={newAction.owner === "me" ? "primary" : "secondary"} onClick={() => setNewAction((current) => ({ ...current, owner: "me" }))}>Me</Button>
                  {participants.length > 1 ? (
                    participants.map((person) => (
                      <Button
                        key={person.id}
                        type="button"
                        size="small"
                        variant={newAction.owner === "guest" && newAction.participantId === person.id ? "primary" : "secondary"}
                        onClick={() => setNewAction((current) => ({ ...current, owner: "guest", participantId: person.id }))}
                      >{person.name || "Guest"}</Button>
                    ))
                  ) : (
                    <Button type="button" size="small" variant={newAction.owner === "guest" ? "primary" : "secondary"} onClick={() => setNewAction((current) => ({ ...current, owner: "guest", participantId: "" }))}>{encounter.personName || "Guest"}</Button>
                  )}
                </div>
              </div>
              {newAction.owner === "me" && participants.length > 1 ? (
                <SelectField
                  label="For person"
                  value={newAction.participantId || participants[0]?.id || ""}
                  onChange={(event) => setNewAction((current) => ({ ...current, participantId: event.target.value }))}
                >
                  {participants.map((person) => (
                    <option key={person.id} value={person.id}>{person.name || "Guest"}</option>
                  ))}
                </SelectField>
              ) : null}
              <div className="quick-follow-up-meta">
                <SelectField label="Channel" value={newAction.channel} onChange={(event) => setNewAction((current) => ({ ...current, channel: event.target.value as EncounterAction["channel"] }))}>
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="send">Send something</option>
                </SelectField>
                <TextField label="Due date" type="date" value={newAction.dueAt} onChange={(event) => setNewAction((current) => ({ ...current, dueAt: event.target.value }))} />
              </div>
              <div className="quick-follow-up-detail">
                <button
                  type="button"
                  aria-expanded={newActionDetailOpen}
                  onClick={() => setNewActionDetailOpen((value) => !value)}
                  className="quick-follow-up-detail-toggle"
                >
                  <small className="block text-[11px] font-extrabold uppercase tracking-wide text-[#8391a5]">What do you need to do? (optional)</small>
                  {newActionDetailOpen ? <CaretUpIcon size={16} weight="bold" /> : <CaretDownIcon size={16} weight="bold" />}
                </button>
                {newActionDetailOpen ? (
                  <TextField
                    label="Follow-up"
                    hint="Shown in your reminders so you know what this one's about."
                    value={newAction.title}
                    onChange={(event) => setNewAction((current) => ({ ...current, title: event.target.value }))}
                    placeholder="e.g. Send the introduction"
                  />
                ) : null}
              </div>
              <div className="quick-follow-up-actions">
                <Button variant="ghost" onClick={() => setActionComposerOpen(false)}>Cancel</Button>
                <Button onClick={addAction}><PlusIcon size={15} weight="bold" />Add</Button>
              </div>
            </div> : null}
          </section>

        </main>

        <aside className="share-rail">
          <span>{encounter.status === "shared" ? "Ready to share" : "Optional"}</span>
          <h2>{encounter.status === "shared" ? "The guest view is ready." : "Share when you’re ready."}</h2>
          <p>{encounter.status === "shared" ? "Send the secure link yourself. Nothing is sent automatically." : `Creating a guest link also confirms your review, if you haven’t already. Shared recordings remain online for ${CLOUD_RECORDING_RETENTION_DAYS} days.`}</p>
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
            <Button fullWidth onClick={approveAndShare}><CheckCircleIcon size={18} weight="bold" />Approve and create link</Button>
          ) : (
            <Button fullWidth onClick={() => void copyGuestLink()}><CopyIcon size={18} weight="bold" />Copy guest link</Button>
          )}
          {encounter.status === "shared" && encounter.personEmail ? (
            <a className="email-invite" href={recordingShareMailtoHref({
              title: encounter.title,
              personName: encounter.personName,
              personEmail: encounter.personEmail,
              guestUrl,
              sharedSummary: encounter.sharedSummary,
              meetingDate: formatMeetingEmailDate(encounter.startedAt),
              cloudExpired,
            })}><EnvelopeSimpleIcon size={18} weight="bold" />Email guest link</a>
          ) : null}
          {showEmailRecording ? (
            <>
              <a className="email-invite" href={recordingEmailHref}><EnvelopeSimpleIcon size={18} weight="bold" />Email recording + details</a>
              <a className="email-invite" href={localAudioUrl ?? "#"} download={`${encounter.title.replace(/[^\w\- ]+/g, "").trim() || "ehllo"}-recording.${localRecordingMimeType.includes("wav") ? "wav" : "m4a"}`}>Download recording for attachment</a>
              <small>Email apps cannot attach files automatically. Download the recording, then attach it in your email draft.</small>
            </>
          ) : null}
          <small>{encounter.status === "shared" ? "Only the approved recap and participant follow-ups are visible." : "Keep this private by leaving it as a draft."}</small>
          {message && <p className="share-message" role="status">{message}</p>}
        </aside>
      </div>
    </>
  );
}

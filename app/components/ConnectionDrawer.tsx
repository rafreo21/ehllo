"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { ChevronRight as CaretRightIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Copy as CopyIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { Mic as MicrophoneIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { Trash2 as TrashIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { AddFollowUpModal } from "./AddFollowUpModal";
import { Button, LinkButton } from "./Button";
import { CaptureComingSoonModal } from "./CaptureComingSoonModal";
import { CapturePromoBanner } from "./CapturePromoBanner";
import { EncounterDrawerView } from "./EncounterDrawerView";
import { FollowUpDetailDrawer } from "./FollowUpDetailDrawer";
import { PageSkeleton, StatusMessage } from "./AsyncState";
import { deleteConnection, type ConnectionItem } from "../../lib/connections";

type Meeting = {
  id: string;
  title: string;
  startedAt: string;
  durationSeconds?: number;
  recording?: unknown;
};

type FollowUp = {
  encounterId: string;
  actionId: string;
  title: string;
  status: string;
  dueAt?: string;
  completedAt?: string;
};

type TimelineItem = { id: string; kind: "meeting" | "completed"; occurredAt: string; title: string; encounterId: string };

const HISTORY_PREVIEW_SIZE = 3;

function formatMeetingDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ConnectionDrawer({
  connection,
  onClose,
  onRemoved,
}: {
  connection: ConnectionItem | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [activeEncounterId, setActiveEncounterId] = useState("");
  const [activeFollowUp, setActiveFollowUp] = useState<{ encounterId: string; actionId: string } | null>(null);
  const [addFollowUpModalOpen, setAddFollowUpModalOpen] = useState(false);

  const load = useCallback(async (target: ConnectionItem) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      query.set("sourceId", target.sourceId);
      if (target.source === "contact") query.set("contactId", target.sourceId);
      if (target.email) query.set("email", target.email);
      if (target.source === "inbound") query.set("exchangeId", target.sourceId);

      const [meetingsRes, followUpsRes] = await Promise.all([
        fetch(`/api/encounters?${query.toString()}`, { cache: "no-store" }),
        fetch(`/api/follow-ups?${query.toString()}`, { cache: "no-store" }),
      ]);

      setMeetings(meetingsRes.ok ? ((await meetingsRes.json() as { encounters?: Meeting[] }).encounters ?? []) : []);
      setFollowUps(followUpsRes.ok ? ((await followUpsRes.json() as { followUps?: FollowUp[] }).followUps ?? []) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setShowAllHistory(false);
    setCardModalOpen(false);
    setLinkCopied(false);
    setActiveEncounterId("");
    if (connection) void load(connection);
  }, [connection, load]);

  async function copyCardLink() {
    if (!connection?.cardSlug) return;
    const url = `${window.location.origin}/c/${encodeURIComponent(connection.cardSlug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // link is still visible/selectable in the modal as a fallback.
    }
  }

  const openFollowUps = useMemo(
    () => followUps
      .filter((item) => item.status !== "completed" && item.status !== "done")
      .sort((left, right) => (left.dueAt || "9999-99-99").localeCompare(right.dueAt || "9999-99-99")),
    [followUps],
  );
  const followUpPreview = useMemo(() => openFollowUps.slice(0, 2), [openFollowUps]);
  // Quick Follow-up creates a placeholder encounter just to hold its task —
  // no conversation happened, so it shouldn't read as a "Meeting" in History.
  const recordedMeetings = useMemo(
    () => meetings.filter((meeting) => (meeting.durationSeconds ?? 0) > 0 || meeting.recording),
    [meetings],
  );
  const timeline = useMemo<TimelineItem[]>(() => recordedMeetings
    .map((meeting): TimelineItem => ({
      id: `meeting-${meeting.id}`,
      kind: "meeting",
      occurredAt: meeting.startedAt,
      title: meeting.title?.trim() || "Meeting",
      encounterId: meeting.id,
    }))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)), [recordedMeetings]);
  const visibleTimeline = showAllHistory ? timeline : timeline.slice(0, HISTORY_PREVIEW_SIZE);

  async function handleRemove() {
    if (!connection) return;
    if (!window.confirm(`Are you sure you want to delete ${connection.name}? You can always reconnect or add them again later.`)) return;
    setDeleting(true);
    try {
      await deleteConnection(connection);
      onRemoved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this connection.");
      setDeleting(false);
    }
  }

  if (!connection) return null;

  const followUpPrefill = {
    personName: connection.name,
    personEmail: connection.email || undefined,
    sourceId: connection.sourceId,
    contactId: connection.source === "contact" ? connection.sourceId : undefined,
    exchangeId: connection.source === "inbound" ? connection.sourceId : undefined,
  };

  return (
    <div className="followup-drawer-backdrop" role="presentation" onClick={onClose}>
      <div className="followup-drawer" role="dialog" aria-label={connection.name} onClick={(event) => event.stopPropagation()}>
        <div className="followup-drawer-header">
          {activeEncounterId ? (
            <button type="button" className="encounter-drawer-back" onClick={() => setActiveEncounterId("")}>
              <ArrowLeftIcon size={15} />Back
            </button>
          ) : (
            <div>
              <h2>{connection.name}</h2>
              <p>{connection.subtitle}</p>
            </div>
          )}
          <div className="followup-drawer-header-actions">
            {!activeEncounterId ? (
              <>
                <Button size="small" onClick={() => setAddFollowUpModalOpen(true)}><PlusIcon size={15} />Follow-up</Button>
                <Button className="connections-remove-btn" size="small" variant="ghost" onClick={() => void handleRemove()} disabled={deleting} aria-label="Remove connection">
                  <TrashIcon size={16} />
                </Button>
              </>
            ) : null}
            <button type="button" aria-label="Close" onClick={onClose}><XIcon size={18} /></button>
          </div>
        </div>
        {activeEncounterId ? (
          <EncounterDrawerView encounterId={activeEncounterId} />
        ) : (
        <div className="followup-drawer-body">
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

          <CapturePromoBanner compact onClick={() => setCaptureModalOpen(true)} />

          {loading ? <PageSkeleton rows={3} /> : (
            <>
              <section className="connections-section relationship-timeline">
                <div className="connections-section-head">
                  <h2>History</h2>
                </div>
                {timeline.length ? (
                  <>
                    <div className="connections-list">
                      {visibleTimeline.map((item) => (
                        <button type="button" className="connections-row timeline-row" key={item.id} onClick={() => setActiveEncounterId(item.encounterId)}>
                          <span className={`timeline-marker ${item.kind}`} aria-hidden="true">
                            {item.kind === "completed" ? <CheckCircleIcon size={16} /> : <MicrophoneIcon size={16} />}
                          </span>
                          <div className="connections-copy">
                            <strong>{item.title}</strong>
                            <span>{item.kind === "completed" ? "Follow-up completed" : "Meeting"} · {formatMeetingDate(item.occurredAt)}</span>
                          </div>
                          <CaretRightIcon size={16} />
                        </button>
                      ))}
                    </div>
                    {timeline.length > HISTORY_PREVIEW_SIZE ? (
                      <Button size="small" variant="ghost" onClick={() => setShowAllHistory((value) => !value)}>
                        {showAllHistory ? "Show less" : `View more (${timeline.length - HISTORY_PREVIEW_SIZE})`}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="connections-count">No meetings recorded yet.</p>
                )}
              </section>

              {followUpPreview.length ? (
                <section className="connections-section">
                  <div className="connections-section-head">
                    <h2>Follow-ups</h2>
                    {openFollowUps.length > 2 ? (
                      <LinkButton size="small" variant="ghost" href={`/app/followups?person=${encodeURIComponent(connection.name)}`}>View all</LinkButton>
                    ) : null}
                  </div>
                  <div className="connections-list">
                    {followUpPreview.map((item) => (
                      <button
                        type="button"
                        className="connections-row connections-row-simple"
                        key={`${item.encounterId}-${item.actionId}`}
                        onClick={() => setActiveFollowUp({ encounterId: item.encounterId, actionId: item.actionId })}
                      >
                        <div className="connections-copy">
                          <strong>{item.title}</strong>
                          <span>{item.dueAt ? `Due ${item.dueAt}` : "No due date"}</span>
                        </div>
                        <CaretRightIcon size={16} />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {connection.cardSlug ? (
                <button type="button" className="connections-card-cta" onClick={() => setCardModalOpen(true)}>
                  <IdentificationCardIcon size={20} />
                  <div>
                    <strong>View card</strong>
                    <span>Open their public ehllo card</span>
                  </div>
                  <CaretRightIcon size={16} />
                </button>
              ) : (
                <div className="connections-card-cta connections-card-cta-muted">
                  <IdentificationCardIcon size={20} />
                  <div>
                    <strong>No public card linked</strong>
                    <span>Save their details from a scan or inbound share.</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        )}
      </div>

      {cardModalOpen && connection.cardSlug ? (
        <div className="card-modal-backdrop" role="presentation" onClick={() => setCardModalOpen(false)}>
          <div className="card-modal" role="dialog" aria-label={`${connection.name}'s card`} onClick={(event) => event.stopPropagation()}>
            <div className="card-modal-header">
              <Button size="small" variant="secondary" onClick={() => void copyCardLink()}>
                <CopyIcon size={15} />{linkCopied ? "Copied!" : "Copy link"}
              </Button>
              <button type="button" aria-label="Close" onClick={() => setCardModalOpen(false)}><XIcon size={18} /></button>
            </div>
            <iframe
              className="card-modal-frame"
              src={`/c/${encodeURIComponent(connection.cardSlug)}`}
              title={`${connection.name}'s card`}
            />
          </div>
        </div>
      ) : null}

      <CaptureComingSoonModal open={captureModalOpen} onClose={() => setCaptureModalOpen(false)} />
      {activeFollowUp ? (
        <FollowUpDetailDrawer
          encounterId={activeFollowUp.encounterId}
          actionId={activeFollowUp.actionId}
          onClose={() => setActiveFollowUp(null)}
          onChanged={() => { if (connection) void load(connection); }}
          stacked
        />
      ) : null}
      <AddFollowUpModal
        open={addFollowUpModalOpen}
        onClose={() => setAddFollowUpModalOpen(false)}
        prefill={followUpPrefill}
        onCreated={() => { if (connection) void load(connection); }}
        stacked
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { IdentificationCardIcon } from "@phosphor-icons/react/dist/csr/IdentificationCard";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { PageSkeleton, StatusMessage } from "../../../components/AsyncState";
import { Button, LinkButton } from "../../../components/Button";
import { CapturePromoBanner } from "../../../components/CapturePromoBanner";
import {
  deleteConnection,
  fetchAllConnectionsMerged,
  type ConnectionItem,
} from "../../../../lib/connections";

type Meeting = {
  id: string;
  title: string;
  startedAt: string;
  sharedSummary?: string;
  personName?: string;
  personEmail?: string;
  durationSeconds?: number;
  recording?: unknown;
};

type FollowUp = {
  encounterId: string;
  actionId: string;
  title: string;
  personName: string;
  personEmail: string;
  status: string;
  dueAt?: string;
  completedAt?: string;
  encounterTitle?: string;
};

type TimelineItem =
  | { id: string; kind: "meeting"; occurredAt: string; title: string; copy?: string; encounterId: string }
  | { id: string; kind: "completed"; occurredAt: string; title: string; copy?: string; encounterId: string };

function formatMeetingDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ConnectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const connectionId = decodeURIComponent(params.id || "");
  const [connection, setConnection] = useState<ConnectionItem | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError("");
    try {
      const connections = await fetchAllConnectionsMerged();
      const match = connections.find((item) => item.id === connectionId) || null;
      setConnection(match);
      if (!match) {
        setError("This connection could not be found.");
        setMeetings([]);
        setFollowUps([]);
        return;
      }

      const query = new URLSearchParams();
      query.set("sourceId", match.sourceId);
      if (match.source === "contact") query.set("contactId", match.sourceId);
      if (match.email) query.set("email", match.email);
      if (match.source === "inbound") query.set("exchangeId", match.sourceId);

      const [meetingsRes, followUpsRes] = await Promise.all([
        fetch(`/api/encounters?${query.toString()}`, { cache: "no-store" }),
        fetch(`/api/follow-ups?${query.toString()}`, { cache: "no-store" }),
      ]);

      if (meetingsRes.ok) {
        const payload = await meetingsRes.json() as { encounters?: Meeting[] };
        setMeetings(payload.encounters ?? []);
      } else {
        setMeetings([]);
      }

      if (followUpsRes.ok) {
        const payload = await followUpsRes.json() as { followUps?: FollowUp[] };
        setFollowUps(payload.followUps ?? []);
      } else {
        setFollowUps([]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this connection.");
      setConnection(null);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState !== "hidden") void load(true);
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, [load]);

  const openFollowUps = useMemo(
    () => followUps.filter((item) => item.status !== "completed" && item.status !== "done"),
    [followUps],
  );
  const followUpPreview = useMemo(() => openFollowUps.slice(0, 2), [openFollowUps]);
  // Quick Follow-up creates a placeholder encounter just to hold its task —
  // no conversation happened, so it shouldn't read as a "Meeting" in History.
  const recordedMeetings = useMemo(
    () => meetings.filter((meeting) => (meeting.durationSeconds ?? 0) > 0 || meeting.recording),
    [meetings],
  );
  const timeline = useMemo<TimelineItem[]>(() => [
    ...recordedMeetings.map((meeting): TimelineItem => ({
      id: `meeting-${meeting.id}`,
      kind: "meeting",
      occurredAt: meeting.startedAt,
      title: meeting.title?.trim() || "Meeting",
      copy: meeting.sharedSummary?.trim(),
      encounterId: meeting.id,
    })),
    ...followUps
      .filter((item) => (item.status === "completed" || item.status === "done") && item.completedAt)
      .map((item): TimelineItem => ({
        id: `follow-up-${item.encounterId}-${item.actionId}`,
        kind: "completed",
        occurredAt: item.completedAt || "",
        title: item.title,
        // The meeting itself already has its own History cell in this same
        // list, so repeating its title here read as duplicated text.
        copy: undefined,
        encounterId: item.encounterId,
      })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)), [followUps, meetings, recordedMeetings]);

  async function confirmDelete() {
    if (!connection) return;
    if (!window.confirm(`Remove ${connection.name} from your connections?`)) return;
    setDeleting(true);
    try {
      await deleteConnection(connection);
      router.push("/app/people");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this connection.");
      setDeleting(false);
    }
  }

  const followUpHref = connection
    ? `/app/followups/new?personName=${encodeURIComponent(connection.name)}&sourceId=${encodeURIComponent(connection.sourceId)}${connection.email ? `&personEmail=${encodeURIComponent(connection.email)}` : ""}${connection.source === "contact" ? `&contactId=${encodeURIComponent(connection.sourceId)}` : ""}${connection.source === "inbound" ? `&exchangeId=${encodeURIComponent(connection.sourceId)}` : ""}`
    : "/app/followups/new";

  useAppShellChrome({
    backHref: "/app/people",
    actions: (
      <div className="header-actions-row">
        {connection ? (
          <Button size="small" variant="ghost" onClick={() => void confirmDelete()} disabled={deleting} aria-label="Remove connection">
            <TrashIcon size={16} weight="bold" />
          </Button>
        ) : null}
      </div>
    ),
  });

  return (
    <>
      <div className="flow-page connections-page">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        {loading ? (
          <PageSkeleton rows={4} />
        ) : connection ? (
          <>
            <div className="flow-heading">
              <div>
                <h1>{connection.name}</h1>
                <p>{connection.subtitle}</p>
                {recordedMeetings.length ? (
                  <small className="connections-count">
                    {recordedMeetings.length === 1 ? "1 conversation" : `${recordedMeetings.length} conversations`}
                  </small>
                ) : null}
              </div>
              <div className="flow-heading-actions">
                <LinkButton href={followUpHref}><PlusIcon size={16} weight="bold" />Follow-up</LinkButton>
              </div>
            </div>

            <CapturePromoBanner compact />

            <section className="connections-section relationship-timeline">
              <div className="connections-section-head">
                <h2>History</h2>
              </div>
              {timeline.length ? (
                <div className="connections-list">
                  {timeline.map((item) => (
                    <a className="connections-row timeline-row" key={item.id} href={`/app/encounters/${item.encounterId}`}>
                      <span className={`timeline-marker ${item.kind}`} aria-hidden="true">
                        {item.kind === "completed" ? <CheckCircleIcon size={16} weight="fill" /> : <MicrophoneIcon size={16} weight="fill" />}
                      </span>
                      <div className="connections-copy">
                        <strong>{item.title}</strong>
                        <span>{item.kind === "completed" ? "Follow-up completed" : "Meeting"} · {formatMeetingDate(item.occurredAt)}</span>
                        {item.copy ? <small>{item.copy}</small> : null}
                      </div>
                      <CaretRightIcon size={16} weight="bold" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="connections-count">No meetings recorded yet.</p>
              )}
            </section>

            {followUpPreview.length ? (
              <section className="connections-section">
                <div className="connections-section-head">
                  <h2>Follow-ups</h2>
                  {openFollowUps.length > 2 ? <LinkButton size="small" variant="ghost" href="/app/followups">View all</LinkButton> : null}
                </div>
                <div className="connections-list">
                  {followUpPreview.map((item) => (
                    <a className="connections-row" key={`${item.encounterId}-${item.actionId}`} href="/app/followups">
                      <div className="connections-copy">
                        <strong>{item.title}</strong>
                        <span>{item.dueAt ? `Due ${item.dueAt}` : "No due date"}</span>
                      </div>
                      <CaretRightIcon size={16} weight="bold" />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {connection.cardSlug ? (
              <a className="connections-card-cta" href={`/c/${encodeURIComponent(connection.cardSlug)}`}>
                <IdentificationCardIcon size={20} weight="bold" />
                <div>
                  <strong>View card</strong>
                  <span>Open their public ehllo card</span>
                </div>
                <CaretRightIcon size={16} weight="bold" />
              </a>
            ) : (
              <div className="connections-card-cta connections-card-cta-muted">
                <IdentificationCardIcon size={20} weight="bold" />
                <div>
                  <strong>No public card linked</strong>
                  <span>Save their details from a scan or inbound share.</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div>
              <h2>Connection not found</h2>
              <p>This person may have been removed.</p>
              <LinkButton href="/app/people">Back to Connections</LinkButton>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

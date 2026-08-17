"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { CheckSquare as ListChecksIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { ScanIcon } from "@phosphor-icons/react/dist/csr/Scan";
import { TrendingUp as TrendUpIcon } from "react-feather";
import { Users as UsersThreeIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { AddFollowUpModal } from "../components/AddFollowUpModal";
import { Button, LinkButton } from "../components/Button";
import { PageSkeleton } from "../components/AsyncState";
import { CapturePromoBanner } from "../components/CapturePromoBanner";
import { EncounterDrawerView } from "../components/EncounterDrawerView";
import { useAppUser } from "../components/AppUserContext";
import {
  connectionAvatarUrl,
  fetchAllConnectionsMerged,
  formatConnectionDate,
  sortConnections,
  type ConnectionItem,
} from "../../lib/connections";
import { getActiveCardId, readCardLibrary, type LibraryCard } from "../../lib/card-library";
import { readEncounters } from "../../lib/encounters";

type FollowUpRow = {
  status?: string;
  owner?: string;
  dueAt?: string;
  personName?: string;
  personEmail?: string;
};

type FollowUpNudge = {
  openCount: number;
  urgentCount: number;
  completedCount: number;
  completionRate: number;
};

function isDueNow(dueAt: string) {
  if (!dueAt.trim()) return false;
  const due = new Date(`${dueAt.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() <= today.getTime();
}

function isOverdue(dueAt: string) {
  if (!dueAt.trim()) return false;
  const due = new Date(`${dueAt.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeDashboard() {
  const user = useAppUser();
  const firstName = (user.displayName || user.email.split("@")[0] || "").trim().split(/\s+/)[0] || "";

  const [hydrated, setHydrated] = useState(false);
  const [greeting, setGreeting] = useState("Welcome back");
  const [nudge, setNudge] = useState<FollowUpNudge>({ openCount: 0, urgentCount: 0, completedCount: 0, completionRate: 0 });
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [followUpsFailed, setFollowUpsFailed] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [latestDraftId, setLatestDraftId] = useState("");
  const [sortedConnections, setSortedConnections] = useState<ConnectionItem[]>([]);
  const [connectionsFailed, setConnectionsFailed] = useState(false);
  const [card, setCard] = useState<LibraryCard | null>(null);
  const [hasCards, setHasCards] = useState(false);
  const [activeEncounterId, setActiveEncounterId] = useState("");
  const [addFollowUpModalOpen, setAddFollowUpModalOpen] = useState(false);

  function loadFollowUps() {
    return fetch("/api/follow-ups", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load follow-ups");
      const payload = await response.json() as { followUps?: FollowUpRow[] };
      const items = payload.followUps ?? [];
      setFollowUps(items);
      const completedCount = items.filter((item) => item.status === "completed").length;
      const openCount = items.filter((item) => item.status !== "completed").length;
      const urgentCount = items.filter((item) => (
        item.status !== "completed" && item.owner === "me" && isDueNow(item.dueAt ?? "")
      )).length;
      const completionRate = items.length ? Math.round((completedCount / items.length) * 100) : 0;
      setNudge({ openCount, urgentCount, completedCount, completionRate });
      setFollowUpsFailed(false);
    }).catch(() => setFollowUpsFailed(true));
  }

  function loadConnections() {
    return fetchAllConnectionsMerged()
      .then((items) => {
        setSortedConnections(sortConnections(items, "date"));
        setConnectionsFailed(false);
      })
      .catch(() => setConnectionsFailed(true));
  }

  function loadLocalData() {
    const encounters = readEncounters();
    const draftEncounters = encounters.filter((item) => item.status === "draft");
    setReviewCount(draftEncounters.length);
    const mostRecent = [...draftEncounters].sort((left, right) => (
      new Date(right.startedAt || 0).getTime() - new Date(left.startedAt || 0).getTime()
    ))[0];
    setLatestDraftId(mostRecent?.id || "");

    const library = readCardLibrary(localStorage);
    setHasCards(library.length > 0);
    const activeId = getActiveCardId(localStorage, library);
    setCard(library.find((item) => item.id === activeId) || library[0] || null);
  }

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setGreeting(timeGreeting());
      loadLocalData();
      await Promise.allSettled([loadFollowUps(), loadConnections()]);
      setHydrated(true);
    });
    function refreshWhenVisible() {
      if (document.visibilityState !== "hidden") {
        loadLocalData();
        void loadFollowUps();
        void loadConnections();
      }
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, []);

  const followUpStatLabel = nudge.urgentCount
    ? `${nudge.urgentCount} need${nudge.urgentCount === 1 ? "s" : ""} you`
    : "Open follow-ups";

  const activeWork = useMemo(() => {
    const items: Array<{ key: string; icon: typeof ListChecksIcon; label: string; onSelect: () => void }> = [];
    if (reviewCount > 0 && latestDraftId) {
      items.push({
        key: "review",
        icon: ListChecksIcon,
        label: reviewCount === 1 ? "Ready to review" : `${reviewCount} ready to review`,
        onSelect: () => setActiveEncounterId(latestDraftId),
      });
    }
    return items;
  }, [reviewCount, latestDraftId]);

  const recentPeople = useMemo(() => sortedConnections.slice(0, 3), [sortedConnections]);

  const cardSubtitle = card
    ? [card.name, [card.role, card.company].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")
    : "";

  return (
    <>
      <div className="flow-page home-page">
        <div className="flow-heading">
          <div>
            <h1>{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
            <p>Here’s what needs your attention.</p>
          </div>
        </div>

        {!hydrated ? (
          <PageSkeleton rows={3} />
        ) : (
          <>
            <div className="home-stats">
              <a className="home-stat-tile" href="/app/followups">
                <span className={`home-stat-icon${nudge.urgentCount ? " home-stat-icon-attention" : ""}`}>
                  <ListChecksIcon size={19} />
                </span>
                <strong className="home-stat-value">{nudge.openCount}</strong>
                <span className="home-stat-label">{followUpStatLabel}</span>
              </a>
              <a className="home-stat-tile" href="/app/people">
                <span className="home-stat-icon">
                  <UsersThreeIcon size={19} />
                </span>
                <strong className="home-stat-value">{sortedConnections.length}</strong>
                <span className="home-stat-label">People met</span>
              </a>
              <div className="home-stat-tile">
                <span className="home-stat-icon">
                  <TrendUpIcon size={19} />
                </span>
                <strong className="home-stat-value">{nudge.completionRate}%</strong>
                <span className="home-stat-label">Follow-ups kept</span>
              </div>
            </div>
            {followUpsFailed ? <p className="home-inline-error">Could not load follow-ups. <button type="button" onClick={() => void loadFollowUps()}>Retry</button></p> : null}

            {activeWork.length ? (
              <div className="home-active-work">
                {activeWork.map((item) => (
                  <button type="button" className="home-active-work-row" onClick={item.onSelect} key={item.key}>
                    <span><item.icon size={17} /></span>
                    <strong>{item.label}</strong>
                    <ArrowRightIcon size={15} />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="home-quick-actions">
              <LinkButton href="/app/cards#share"><QrCodeIcon size={17} weight="bold" />Share my card</LinkButton>
              <Button variant="secondary" onClick={() => setAddFollowUpModalOpen(true)}><ListChecksIcon size={17} />Quick follow-up</Button>
              <LinkButton variant="secondary" href="/app/scan"><ScanIcon size={17} weight="bold" />Quick scan</LinkButton>
            </div>

            <CapturePromoBanner />

            <section className="home-section">
              <div className="home-section-head">
                <h2>Recent people</h2>
                {sortedConnections.length > 3 ? (
                  <a className="home-view-all" href="/app/people">View all</a>
                ) : null}
              </div>
              {connectionsFailed ? (
                <p className="home-inline-error">Could not load recent people. <button type="button" onClick={() => void loadConnections()}>Retry</button></p>
              ) : recentPeople.length ? (
                <div className="home-people-list">
                  {recentPeople.map((connection) => {
                    const openFollowUp = followUps.find((item) => (
                      item.status !== "completed"
                      && ((item.personEmail || "").trim().toLowerCase() === (connection.email || "").trim().toLowerCase()
                        || (item.personName || "").trim().toLowerCase() === connection.name.trim().toLowerCase())
                    ));
                    return (
                      <a className="home-person-row" href={`/app/people/${encodeURIComponent(connection.id)}`} key={connection.id}>
                        <img className="connections-avatar" src={connection.photoUrl || connectionAvatarUrl(connection)} alt="" />
                        <span>
                          <strong>{connection.name}</strong>
                          <small>{connection.subtitle}{connection.connectedAt ? ` · ${formatConnectionDate(connection.connectedAt)}` : ""}</small>
                        </span>
                        {openFollowUp ? (
                          <em className={isOverdue(openFollowUp.dueAt ?? "") ? "home-person-tag home-person-tag-overdue" : "home-person-tag"}>
                            {isOverdue(openFollowUp.dueAt ?? "") ? "Overdue" : "Follow-up due"}
                          </em>
                        ) : null}
                        <ArrowRightIcon size={15} />
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="home-empty-compact">
                  <UsersThreeIcon size={20} />
                  <div>
                    <strong>No recent people yet.</strong>
                    <p>Scan a card or add someone after your next conversation.</p>
                  </div>
                  <LinkButton size="small" variant="secondary" href="/app/scan">Scan</LinkButton>
                </div>
              )}
            </section>

            <section className="home-section">
              <h2>My card</h2>
              {hasCards && card ? (
                <a className="home-card-row" href="/app/cards">
                  {card.photo ? <img className="home-card-avatar" src={card.photo} alt="" /> : (
                    <span className="home-card-avatar home-card-avatar-fallback"><IdentificationCardIcon size={20} /></span>
                  )}
                  <span>
                    <strong>{card.label || "My card"}</strong>
                    <small>{cardSubtitle || "Add your details"}</small>
                  </span>
                  <em>Open card</em>
                  <ArrowRightIcon size={15} />
                </a>
              ) : (
                <div className="home-empty-compact">
                  <IdentificationCardIcon size={20} />
                  <div>
                    <strong>Create your first card</strong>
                    <p>Publish a card so people can save your details instantly.</p>
                  </div>
                  <LinkButton size="small" variant="secondary" href="/app/cards">Create card</LinkButton>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {activeEncounterId ? (
        <div className="followup-drawer-backdrop" role="presentation" onClick={() => setActiveEncounterId("")}>
          <div className="followup-drawer" role="dialog" aria-label="Review" onClick={(event) => event.stopPropagation()}>
            <div className="followup-drawer-header">
              <h2>Review</h2>
              <div className="followup-drawer-header-actions">
                <button type="button" aria-label="Close" onClick={() => setActiveEncounterId("")}><XIcon size={18} /></button>
              </div>
            </div>
            <EncounterDrawerView encounterId={activeEncounterId} />
          </div>
        </div>
      ) : null}
      <AddFollowUpModal
        open={addFollowUpModalOpen}
        onClose={() => setAddFollowUpModalOpen(false)}
        popup
      />
    </>
  );
}

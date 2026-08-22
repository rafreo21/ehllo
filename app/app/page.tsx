"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { CheckSquare as ListChecksIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { ScanIcon } from "@phosphor-icons/react/dist/csr/Scan";
import { HandWavingIcon } from "@phosphor-icons/react/dist/csr/HandWaving";
import { TrendingUp as TrendUpIcon } from "react-feather";
import { Users as UsersThreeIcon } from "react-feather";
import { Smartphone as DeviceMobileIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { AddFollowUpModal } from "../components/AddFollowUpModal";
import { Button, LinkButton } from "../components/Button";
import { PageSkeleton } from "../components/AsyncState";
import { EncounterDrawerView } from "../components/EncounterDrawerView";
import { useAppUser } from "../components/AppUserContext";
import {
  connectionAvatarUrl,
  enrichConnectionPhotos,
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

type HomeNudge = {
  id: string;
  type: string;
  title: string;
  body: string;
  actionId: string;
  readAt: string | null;
};

const HOME_FOLLOW_UP_TIP_DISMISSED_KEY = "ehllo-home-follow-up-tip-dismissed-v1";

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
  const [homeNudges, setHomeNudges] = useState<HomeNudge[]>([]);
  const [followUpTipVisible, setFollowUpTipVisible] = useState(false);

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
        void enrichConnectionPhotos(items).then((enriched) => setSortedConnections(sortConnections(enriched, "date")));
      })
      .catch(() => setConnectionsFailed(true));
  }

  function loadHomeNudges() {
    return fetch("/api/notifications", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load notifications");
      const payload = await response.json() as { notifications?: HomeNudge[] };
      setHomeNudges((payload.notifications ?? []).filter((item) => item.type === "keep_in_touch" && !item.readAt));
    }).catch(() => undefined);
  }

  function nudgeHref(item: HomeNudge) {
    const [source, sourceId] = item.actionId.split(":");
    if ((source === "met" || source === "inbound") && sourceId) {
      return `/app/people?connection=${encodeURIComponent(`${source}-${sourceId}`)}`;
    }
    return "/app/people";
  }

  async function dismissHomeNudge(id: string) {
    setHomeNudges((current) => current.filter((item) => item.id !== id));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Best effort: the server will return the card on refresh if it could not save.
    }
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
    setCard(library.find((item) => item.isPrimary) || library.find((item) => item.id === activeId) || library[0] || null);
  }

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setGreeting(timeGreeting());
      setFollowUpTipVisible(localStorage.getItem(HOME_FOLLOW_UP_TIP_DISMISSED_KEY) !== "1");
      loadLocalData();
      await Promise.allSettled([loadFollowUps(), loadConnections(), loadHomeNudges()]);
      setHydrated(true);
    });
    function refreshWhenVisible() {
      if (document.visibilityState !== "hidden") {
        loadLocalData();
        void loadFollowUps();
        void loadConnections();
        void loadHomeNudges();
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

  function dismissFollowUpTip() {
    setFollowUpTipVisible(false);
    localStorage.setItem(HOME_FOLLOW_UP_TIP_DISMISSED_KEY, "1");
  }

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
            <p>Your day at a glance.</p>
          </div>
          <div className="home-quick-actions">
            <LinkButton size="small" href="/app/cards#share"><QrCodeIcon size={15} weight="bold" />Share my card</LinkButton>
            <Button size="small" variant="secondary" onClick={() => setAddFollowUpModalOpen(true)}><ListChecksIcon size={15} />Quick follow-up</Button>
            <LinkButton size="small" variant="secondary" href="/app/scan"><ScanIcon size={15} weight="bold" />Quick scan</LinkButton>
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

            {homeNudges.length ? (
              <div className="home-nudges" aria-label="Reminders">
                {homeNudges.map((item) => (
                  <article className="home-nudge-card" key={item.id}>
                    <a href={nudgeHref(item)}>
                      <span className="home-nudge-icon"><HandWavingIcon size={19} weight="bold" /></span>
                      <span className="home-nudge-copy">
                        <strong>{item.title}</strong>
                        {item.body ? <small>{item.body}</small> : null}
                      </span>
                      <ArrowRightIcon size={15} />
                    </a>
                    <button type="button" aria-label={`Dismiss ${item.title}`} onClick={() => void dismissHomeNudge(item.id)}>
                      <XIcon size={14} />
                    </button>
                  </article>
                ))}
              </div>
            ) : null}

            {followUpTipVisible ? (
              <article className="home-nudge-card home-feature-card">
                <a href="/app/followups">
                  <span className="home-nudge-icon"><ListChecksIcon size={18} /></span>
                  <span className="home-nudge-copy">
                    <strong>Keep your connections moving</strong>
                    <small>Review what is due and close the loop on your next follow-up.</small>
                  </span>
                  <span className="home-feature-action">View follow-ups <ArrowRightIcon size={14} /></span>
                </a>
                <button type="button" aria-label="Dismiss follow-up suggestion" onClick={dismissFollowUpTip}>
                  <XIcon size={14} />
                </button>
              </article>
            ) : null}

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

            <div className="home-content-grid">
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
                      <a className="home-person-row" href={`/app/people?connection=${encodeURIComponent(connection.id)}`} key={connection.id}>
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
              <h2>Primary card</h2>
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
            </div>

            <section className="home-mobile-beta" aria-labelledby="mobile-beta-title">
              <div className="home-mobile-beta-copy">
                <span className="home-mobile-beta-kicker">ehllo mobile</span>
                <h2 id="mobile-beta-title">Take ehllo with you.</h2>
                <p>The mobile app is coming soon. Join testing today on iOS or Android and help shape what ships.</p>
                <div className="home-mobile-beta-platforms" aria-label="Available testing platforms">
                  <span>iOS beta</span>
                  <span>Android beta</span>
                </div>
                <Button size="small" disabled title="Testing form link coming soon">Join mobile testing</Button>
              </div>
              <div className="home-mobile-beta-art" aria-hidden="true">
                <span className="home-mobile-orbit home-mobile-orbit-one" />
                <span className="home-mobile-orbit home-mobile-orbit-two" />
                <div className="home-mobile-phone">
                  <span className="home-mobile-phone-speaker" />
                  <span className="home-mobile-phone-logo"><DeviceMobileIcon size={25} /></span>
                  <strong>ehllo</strong>
                  <small>Meet. Remember. Follow up.</small>
                </div>
              </div>
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

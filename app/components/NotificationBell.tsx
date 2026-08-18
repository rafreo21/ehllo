"use client";

import type { IconComponent } from "../../lib/icon-component";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Bell as BellIcon } from "react-feather";
import { Calendar as CalendarCheckIcon } from "react-feather";
import { Check as CheckIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { RotateCcw as ClockCounterClockwiseIcon } from "react-feather";
import { Share2 as ShareNetworkIcon } from "react-feather";
import { Users as UsersThreeIcon } from "react-feather";
import { HandWavingIcon } from "@phosphor-icons/react/dist/csr/HandWaving";
import { LinkButton } from "./Button";
import { EncounterDrawerView } from "./EncounterDrawerView";
import { BROWSER_NOTIFICATION_CHANGE_EVENT, BROWSER_NOTIFICATION_KEY } from "./NotificationPreferences";

type NotificationType = "review_ready" | "follow_up_due" | "follow_up_overdue" | "shared_meeting_update" | "connection_added" | "keep_in_touch";

type NotificationAlert = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  encounterId: string | null;
  actionId: string;
  readAt: string | null;
  createdAt: string;
};

type FollowUpDueCount = { encounterId: string; actionId: string; owner: "me" | "guest"; status: string; dueAt: string };

const SHOWN_KEY = "aftermeet-shown-browser-notifications-v1";

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isUrgent(dueAt: string): boolean {
  if (!dueAt) return false;
  const due = new Date(`${dueAt.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(0, 0, 0, 0);
  return due <= startOfToday();
}

// "keep_in_touch" alone still renders a Phosphor icon (HandWaving has no
// react-feather equivalent), so it alone keeps the `weight="bold"` prop below.
function iconForType(type: NotificationType): IconComponent {
  switch (type) {
    case "review_ready": return CheckCircleIcon;
    case "follow_up_due": return CalendarCheckIcon;
    case "follow_up_overdue": return ClockCounterClockwiseIcon;
    case "shared_meeting_update": return ShareNetworkIcon;
    case "connection_added": return UsersThreeIcon;
    case "keep_in_touch": return HandWavingIcon;
    default: return BellIcon;
  }
}

function notificationHref(alert: NotificationAlert) {
  if (!alert.encounterId) return "/app/followups";
  return `/app/encounters/${alert.encounterId}`;
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ onActionableCountChange }: { onActionableCountChange?: (count: number) => void }) {
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [activeEncounterId, setActiveEncounterId] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load notifications");
      const payload = await response.json() as { notifications?: NotificationAlert[]; unreadCount?: number };
      setAlerts(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // The "Follow-ups" nav badge counts due/overdue work items, which is a
  // distinct concept from unread notifications - notifications are alerts
  // that point at work, not the work queue itself.
  const loadActionableFollowUpCount = useCallback(async () => {
    try {
      const response = await fetch("/api/follow-ups", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { followUps?: FollowUpDueCount[] };
      const count = (payload.followUps ?? []).filter((item) => (
        item.owner === "me" && item.status !== "completed" && isUrgent(item.dueAt)
      )).length;
      onActionableCountChange?.(count);
    } catch {
      // Leave the last known nav badge rather than flash it away on a transient failure.
    }
  }, [onActionableCountChange]);

  useEffect(() => {
    const syncBrowserPreference = () => setBrowserNotificationsEnabled(
      "Notification" in window
      && Notification.permission === "granted"
      && localStorage.getItem(BROWSER_NOTIFICATION_KEY) === "enabled",
    );
    void Promise.resolve().then(syncBrowserPreference);
    window.addEventListener(BROWSER_NOTIFICATION_CHANGE_EVENT, syncBrowserPreference);
    void Promise.resolve().then(load);
    void Promise.resolve().then(loadActionableFollowUpCount);
    const interval = window.setInterval(() => {
      void load();
      void loadActionableFollowUpCount();
    }, 60_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(BROWSER_NOTIFICATION_CHANGE_EVENT, syncBrowserPreference);
    };
  }, [load, loadActionableFollowUpCount]);

  useEffect(() => {
    if (!browserNotificationsEnabled || !("Notification" in window)) return;
    let shown = new Set<string>();
    try {
      const stored = JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]");
      if (Array.isArray(stored)) shown = new Set(stored.filter((value): value is string => typeof value === "string"));
    } catch {}
    const nextAlerts = alerts.filter((alert) => !alert.readAt && !shown.has(alert.id));
    for (const alert of nextAlerts) {
      const notification = new Notification(alert.title, { body: alert.body, tag: alert.id });
      notification.onclick = () => {
        window.focus();
        window.location.assign(notificationHref(alert));
        notification.close();
      };
      shown.add(alert.id);
    }
    localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(shown).slice(-200)));
  }, [alerts, browserNotificationsEnabled]);

  useEffect(() => {
    function closeWhenOutside(event: MouseEvent) {
      if (shellRef.current && !shellRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  async function markRead(alert: NotificationAlert) {
    if (alert.readAt) {
      setOpen(false);
      return;
    }
    setAlerts((current) => current.map((item) => (item.id === alert.id ? { ...item, readAt: new Date().toISOString() } : item)));
    setUnreadCount((current) => Math.max(0, current - 1));
    setOpen(false);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.id }),
      });
    } catch {
      // Best-effort - the next load() reconciles state if this failed.
    }
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setAlerts((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch {
      // Best-effort - the next load() reconciles state if this failed.
    }
  }

  return (
    <div className="notification-bell-shell" ref={shellRef}>
      <button type="button" className="notification-bell-button" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        <BellIcon size={20} />
        {unreadCount ? <span>{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>

      {open ? (
        <section className="notification-popover" role="dialog" aria-label="Notifications">
          <header>
            <div><span>Attention centre</span><h2>Notifications</h2></div>
            {unreadCount ? <button type="button" onClick={() => void markAllRead()}><CheckIcon size={14} />Mark all read</button> : null}
          </header>
          <div className="notification-popover-body">
            {loading ? <div className="notification-loading"><i /><i /><i /></div> : failed ? (
              <div className="notification-empty"><strong>Couldn&apos;t load notifications</strong><p>Check your connection and try again.</p><button type="button" onClick={() => void load()}>Try again</button></div>
            ) : alerts.length ? alerts.slice(0, 8).map((alert) => {
              const Icon = iconForType(alert.type);
              const isUnread = !alert.readAt;
              const onReadAndOpen = (nextAlert: NotificationAlert) => {
                void markRead(nextAlert);
                if (nextAlert.encounterId && !activeEncounterId) {
                  setActiveEncounterId(nextAlert.encounterId);
                }
              };
              return (
                <button
                  type="button"
                  className={`notification-item ${isUnread ? "is-unread" : ""}`}
                  style={{ border: 0, background: "transparent", width: "100%", textAlign: "left", cursor: "pointer", color: "inherit" }}
                  key={alert.id}
                  onClick={() => onReadAndOpen(alert)}
                >
                  <span className={`notification-status notification-status-${alert.type}`}>{alert.type === "keep_in_touch" ? <Icon size={17} weight="bold" /> : <Icon size={17} />}</span>
                  <span><strong>{alert.title}</strong>{alert.body ? <small>{alert.body}</small> : null}<em>{relativeTime(alert.createdAt)}</em></span>
                  {isUnread ? <i aria-label="Unread" /> : null}
                </button>
              );
            }) : (
              <div className="notification-empty"><span><CheckIcon size={22} /></span><strong>You&apos;re all caught up</strong><p>Review-ready captures, due follow-ups, and shared-meeting updates will appear here.</p></div>
            )}
          </div>
          <footer><LinkButton fullWidth variant="secondary" href="/app/followups" onClick={() => setOpen(false)}>Open follow-ups</LinkButton></footer>
        </section>
      ) : null}

      {activeEncounterId ? (
        <div className="followup-drawer-backdrop" role="presentation" onClick={() => setActiveEncounterId("") }>
          <div className="followup-drawer" role="dialog" aria-label="Review context" onClick={(event) => event.stopPropagation()}>
            <div className="followup-drawer-header">
              <h2>Review context</h2>
            </div>
            <EncounterDrawerView encounterId={activeEncounterId} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { CalendarCheckIcon } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { StatusMessage } from "./AsyncState";

export const BROWSER_NOTIFICATION_KEY = "aftermeet-browser-notifications-v1";
export const BROWSER_NOTIFICATION_CHANGE_EVENT = "aftermeet-browser-notifications-change";

type BrowserPermission = NotificationPermission | "unsupported";

type NotificationType = "review_ready" | "follow_up_due" | "follow_up_overdue" | "shared_meeting_update";
type NotificationPreferenceMap = Record<NotificationType, boolean>;

const DEFAULT_TYPE_PREFERENCES: NotificationPreferenceMap = {
  review_ready: true,
  follow_up_due: true,
  follow_up_overdue: true,
  shared_meeting_update: true,
};

const NOTIFICATION_TYPE_ROWS: Array<{ type: NotificationType; icon: typeof BellIcon; label: string; hint: string }> = [
  { type: "review_ready", icon: CheckCircleIcon, label: "Transcript ready", hint: "A capture is ready for your review." },
  { type: "follow_up_due", icon: CalendarCheckIcon, label: "Follow-up due", hint: "A reviewed follow-up is due today." },
  { type: "follow_up_overdue", icon: ClockCounterClockwiseIcon, label: "Follow-up overdue", hint: "A reviewed follow-up is overdue." },
  { type: "shared_meeting_update", icon: ShareNetworkIcon, label: "Shared meeting updates", hint: "A guest commits to their own follow-up." },
];

function readBrowserEnabled() {
  return typeof window !== "undefined" && localStorage.getItem(BROWSER_NOTIFICATION_KEY) === "enabled";
}

function PreferenceSwitch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`preference-switch ${checked ? "is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    ><span /></button>
  );
}

export function NotificationPreferences() {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<BrowserPermission>("unsupported");
  const [typePreferences, setTypePreferences] = useState<NotificationPreferenceMap>(DEFAULT_TYPE_PREFERENCES);
  const [typeSaving, setTypeSaving] = useState<NotificationType | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const permission: BrowserPermission = "Notification" in window ? Notification.permission : "unsupported";
    void Promise.resolve().then(() => {
      setBrowserPermission(permission);
      setBrowserEnabled(readBrowserEnabled() && permission === "granted");
    });
    void fetch("/api/settings/notifications", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as {
          emailRemindersEnabled?: boolean;
          notificationPreferences?: NotificationPreferenceMap;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Could not load notification preferences.");
        setEmailEnabled(payload.emailRemindersEnabled !== false);
        if (payload.notificationPreferences) setTypePreferences(payload.notificationPreferences);
      })
      .catch((error) => setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load notification preferences." }))
      .finally(() => setLoading(false));
  }, []);

  async function toggleType(type: NotificationType, next: boolean) {
    const previous = typePreferences;
    const updated = { ...typePreferences, [type]: next };
    setTypePreferences(updated);
    setTypeSaving(type);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPreferences: updated }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update this preference.");
    } catch (error) {
      setTypePreferences(previous);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not update this preference." });
    } finally {
      setTypeSaving(null);
    }
  }

  async function toggleEmail(next: boolean) {
    const previous = emailEnabled;
    setEmailEnabled(next);
    setEmailSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailRemindersEnabled: next }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update email reminders.");
      setMessage({ tone: "success", text: next ? "Email reminders are on across Ehllo." : "Email reminders are off across Ehllo." });
    } catch (error) {
      setEmailEnabled(previous);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not update email reminders." });
    } finally {
      setEmailSaving(false);
    }
  }

  async function toggleBrowser(next: boolean) {
    setMessage(null);
    if (!next) {
      localStorage.removeItem(BROWSER_NOTIFICATION_KEY);
      setBrowserEnabled(false);
      window.dispatchEvent(new Event(BROWSER_NOTIFICATION_CHANGE_EVENT));
      setMessage({ tone: "success", text: "Browser notifications are off in this browser." });
      return;
    }
    if (!("Notification" in window)) {
      setMessage({ tone: "error", text: "This browser does not support browser notifications." });
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setBrowserPermission(permission);
    if (permission !== "granted") {
      localStorage.removeItem(BROWSER_NOTIFICATION_KEY);
      setBrowserEnabled(false);
      setMessage({ tone: "error", text: permission === "denied" ? "Notifications are blocked. Allow them in your browser’s site settings." : "Permission was not granted, so browser notifications remain off." });
      return;
    }
    localStorage.setItem(BROWSER_NOTIFICATION_KEY, "enabled");
    setBrowserEnabled(true);
    window.dispatchEvent(new Event(BROWSER_NOTIFICATION_CHANGE_EVENT));
    setMessage({ tone: "success", text: "Browser notifications are on for this browser." });
  }

  return (
    <section className="settings-panel notification-preferences" aria-labelledby="notification-preferences-heading">
      <header><div><h2 id="notification-preferences-heading">Notification preferences</h2><p>Choose how Ehllo reminds you about follow-ups.</p></div></header>
      {message ? <StatusMessage tone={message.tone}>{message.text}</StatusMessage> : null}
      <div className="preference-row">
        <span className="preference-icon"><EnvelopeSimpleIcon size={22} weight="bold" /></span>
        <div><h3>Email reminders</h3><p>Email me when a follow-up becomes overdue. This preference is shared with iOS and Android.</p></div>
        <PreferenceSwitch checked={emailEnabled} disabled={loading || emailSaving} label="Email reminders" onChange={(next) => void toggleEmail(next)} />
      </div>
      <div className="preference-row">
        <span className="preference-icon"><BellIcon size={22} weight="bold" /></span>
        <div><h3>Browser notifications</h3><p>Show due follow-up alerts in this browser while Ehllo is open.</p>{browserPermission === "denied" ? <small>Blocked in browser settings</small> : browserPermission === "unsupported" ? <small>Not supported by this browser</small> : null}</div>
        <PreferenceSwitch checked={browserEnabled} disabled={browserPermission === "unsupported"} label="Browser notifications" onChange={(next) => void toggleBrowser(next)} />
      </div>
      <p className="preference-group-label">Notify me about</p>
      {NOTIFICATION_TYPE_ROWS.map((row) => (
        <div className="preference-row" key={row.type}>
          <span className="preference-icon"><row.icon size={22} weight="bold" /></span>
          <div><h3>{row.label}</h3><p>{row.hint}</p></div>
          <PreferenceSwitch
            checked={typePreferences[row.type]}
            disabled={loading || typeSaving === row.type}
            label={row.label}
            onChange={(next) => void toggleType(row.type, next)}
          />
        </div>
      ))}
      <div className="preference-footnote"><p><strong>Mobile reminders are managed on each phone.</strong> iOS and Android permission controls do not appear on the web.</p></div>
    </section>
  );
}

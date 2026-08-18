"use client";

import { type ComponentType, useEffect, useState } from "react";
import type { JSX } from "react";
import { Bell as BellIcon } from "react-feather";
import { Calendar as CalendarCheckIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { RotateCcw as ClockCounterClockwiseIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Share2 as ShareNetworkIcon } from "react-feather";
import { Users as UsersThreeIcon } from "react-feather";
import { HandWavingIcon } from "@phosphor-icons/react/dist/csr/HandWaving";
import { useToast } from "./ToastContext";

export const BROWSER_NOTIFICATION_KEY = "aftermeet-browser-notifications-v1";
export const BROWSER_NOTIFICATION_CHANGE_EVENT = "aftermeet-browser-notifications-change";

type BrowserPermission = NotificationPermission | "unsupported";

type NotificationType = "review_ready" | "follow_up_due" | "follow_up_overdue" | "shared_meeting_update" | "connection_added" | "keep_in_touch";
type NotificationPreferenceMap = Record<NotificationType, boolean>;

const DEFAULT_TYPE_PREFERENCES: NotificationPreferenceMap = {
  review_ready: true,
  follow_up_due: true,
  follow_up_overdue: true,
  shared_meeting_update: true,
  connection_added: true,
  keep_in_touch: true,
};

// "keep_in_touch" alone still renders a Phosphor icon (HandWaving has no
// react-feather equivalent), so it alone keeps the `weight="bold"` prop below.
type NotificationTypeRow = {
  type: NotificationType;
  // ComponentType rather than a hand-written call signature. The mixed
  // Phosphor/react-feather icons here are components with their own prop types,
  // and the narrower signature matched neither - it only ever compiled because
  // nothing typechecked this file.
  icon: ComponentType<{ size?: number; weight?: string }>;
  label: string;
  hint: string;
};
const NOTIFICATION_TYPE_ROWS: NotificationTypeRow[] = [
  { type: "review_ready", icon: CheckCircleIcon, label: "Transcript ready", hint: "A capture is ready for your review." },
  { type: "follow_up_due", icon: CalendarCheckIcon, label: "Follow-up due", hint: "A reviewed follow-up is due today." },
  { type: "follow_up_overdue", icon: ClockCounterClockwiseIcon, label: "Follow-up overdue", hint: "A reviewed follow-up is overdue." },
  { type: "shared_meeting_update", icon: ShareNetworkIcon, label: "Shared meeting updates", hint: "A guest commits to their own follow-up." },
  { type: "connection_added", icon: UsersThreeIcon, label: "New connections", hint: "Someone connects with you by scanning your card." },
  { type: "keep_in_touch", icon: HandWavingIcon, label: "Keep in touch nudges", hint: "A gentle reminder to reach out after you connect." },
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
  const { showToast } = useToast();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<BrowserPermission>("unsupported");
  const [typePreferences, setTypePreferences] = useState<NotificationPreferenceMap>(DEFAULT_TYPE_PREFERENCES);
  const [typeSaving, setTypeSaving] = useState<NotificationType | null>(null);
  const [loading, setLoading] = useState(true);

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
      .catch((error) => showToast({ tone: "error", message: error instanceof Error ? error.message : "Could not load notification preferences." }))
      .finally(() => setLoading(false));
  }, [showToast]);

  async function toggleType(type: NotificationType, next: boolean) {
    const previous = typePreferences;
    const updated = { ...typePreferences, [type]: next };
    setTypePreferences(updated);
    setTypeSaving(type);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPreferences: updated }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update this preference.");
      const text = "Notification preference saved.";
      showToast({ tone: "success", message: text });
    } catch (error) {
      setTypePreferences(previous);
      const text = error instanceof Error ? error.message : "Could not update this preference.";
      showToast({ tone: "error", message: text });
    } finally {
      setTypeSaving(null);
    }
  }

  async function toggleEmail(next: boolean) {
    const previous = emailEnabled;
    setEmailEnabled(next);
    setEmailSaving(true);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailRemindersEnabled: next }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update email reminders.");
      const text = next ? "Email reminders are on across ehllo." : "Email reminders are off across ehllo.";
      showToast({ tone: "success", message: text });
    } catch (error) {
      setEmailEnabled(previous);
      const text = error instanceof Error ? error.message : "Could not update email reminders.";
      showToast({ tone: "error", message: text });
    } finally {
      setEmailSaving(false);
    }
  }

  async function toggleBrowser(next: boolean) {
    if (!next) {
      localStorage.removeItem(BROWSER_NOTIFICATION_KEY);
      setBrowserEnabled(false);
      window.dispatchEvent(new Event(BROWSER_NOTIFICATION_CHANGE_EVENT));
      const text = "Browser notifications are off in this browser.";
      showToast({ tone: "success", message: text });
      return;
    }
    if (!("Notification" in window)) {
      const text = "This browser does not support browser notifications.";
      showToast({ tone: "error", message: text });
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setBrowserPermission(permission);
    if (permission !== "granted") {
      localStorage.removeItem(BROWSER_NOTIFICATION_KEY);
      setBrowserEnabled(false);
      const text = permission === "denied" ? "Notifications are blocked. Allow them in your browser’s site settings." : "Permission was not granted, so browser notifications remain off.";
      showToast({ tone: "error", message: text });
      return;
    }
    localStorage.setItem(BROWSER_NOTIFICATION_KEY, "enabled");
    setBrowserEnabled(true);
    window.dispatchEvent(new Event(BROWSER_NOTIFICATION_CHANGE_EVENT));
    const text = "Browser notifications are on for this browser.";
    showToast({ tone: "success", message: text });
  }

  return (
    <section className="settings-panel notification-preferences" aria-labelledby="notification-preferences-heading">
      <header><div><h2 id="notification-preferences-heading">Notification preferences</h2><p>Choose how ehllo reminds you about follow-ups.</p></div></header>
      <div className="preference-row">
        <span className="preference-icon"><EnvelopeSimpleIcon size={22} /></span>
        <div><h3>Email reminders</h3><p>Email me when a follow-up becomes overdue. This preference is shared with iOS and Android.</p></div>
        <PreferenceSwitch checked={emailEnabled} disabled={loading || emailSaving} label="Email reminders" onChange={(next) => void toggleEmail(next)} />
      </div>
      <div className="preference-row">
        <span className="preference-icon"><BellIcon size={22} /></span>
        <div><h3>Browser notifications</h3><p>Show due follow-up alerts in this browser while ehllo is open.</p>{browserPermission === "denied" ? <small>Blocked in browser settings</small> : browserPermission === "unsupported" ? <small>Not supported by this browser</small> : null}</div>
        <PreferenceSwitch checked={browserEnabled} disabled={browserPermission === "unsupported"} label="Browser notifications" onChange={(next) => void toggleBrowser(next)} />
      </div>
      <p className="preference-group-label">Notify me about</p>
      {NOTIFICATION_TYPE_ROWS.map((row) => (
        <div className="preference-row" key={row.type}>
          <span className="preference-icon">{row.type === "keep_in_touch" ? <row.icon size={22} weight="bold" /> : <row.icon size={22} />}</span>
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

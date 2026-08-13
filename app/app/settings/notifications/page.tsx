"use client";

import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { NotificationPreferences } from "../../../components/NotificationPreferences";

export default function NotificationSettingsPage() {
  useAppShellChrome({ backHref: "/app/settings", backLabel: "Settings" });
  return (
    <div className="flow-page settings-page">
      <div className="flow-heading">
        <div><h1>Notification preferences</h1><p>Choose how ehllo reminds you about follow-ups.</p></div>
      </div>
      <NotificationPreferences />
    </div>
  );
}

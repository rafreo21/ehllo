"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight as CaretRightIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { UploadCloud as CloudArrowUpIcon } from "react-feather";
import { Smartphone as DeviceMobileIcon } from "react-feather";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import type { ConnectedAccountStatus } from "../../../../lib/integrations/types";

type RecordingStorageDestination = "local_only" | "google_drive" | "onedrive";

const STORAGE_KEY = "aftermeet.web.recording-storage-destination";

const STORAGE_OPTIONS: { id: RecordingStorageDestination; label: string; icon: React.ReactNode }[] = [
  { id: "local_only", label: "Only in this browser", icon: <DeviceMobileIcon size={18} /> },
  { id: "google_drive", label: "Google Drive", icon: <CloudArrowUpIcon size={18} /> },
  { id: "onedrive", label: "OneDrive", icon: <CloudArrowUpIcon size={18} /> },
];

export default function RecordingStorageSettingsPage() {
  const router = useRouter();
  const [destination, setDestination] = useState<RecordingStorageDestination>("local_only");
  const [status, setStatus] = useState<ConnectedAccountStatus | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "google_drive" || stored === "onedrive" || stored === "local_only") setDestination(stored);
      void fetch("/api/integrations/status")
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { status?: ConnectedAccountStatus } | null) => {
          if (payload?.status) setStatus(payload.status);
        })
        .catch(() => undefined);
    });
  }, []);

  function select(id: RecordingStorageDestination) {
    setDestination(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  function ready(id: RecordingStorageDestination) {
    if (id === "local_only") return true;
    if (id === "google_drive") return Boolean(status?.google.connected && status.google.capabilities.drive);
    return Boolean(status?.microsoft.connected && status.microsoft.capabilities.onedrive);
  }

  function openConnectedAccounts() {
    const event = new CustomEvent("ehllo:open-settings-panel", {
      cancelable: true,
      detail: { href: "/app/settings/connected-accounts" },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) router.push("/app/settings/connected-accounts");
  }

  useAppShellChrome({ backHref: "/app/settings", backLabel: "Settings" });
  return (
    <>
      <div className="flow-page settings-page">
        <div className="flow-heading">
          <div><h1>Recording storage</h1><p>Where new recordings are stored by default. Doesn&apos;t affect guest sharing.</p></div>
        </div>
        <section className="activate-panel recording-storage-panel">
          <header>
            <h2><CloudArrowUpIcon size={22} /> Recording storage</h2>
          </header>
          <div className="grid gap-2">
            {STORAGE_OPTIONS.map((option) => {
              const selected = destination === option.id;
              const enabled = ready(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => (enabled ? select(option.id) : openConnectedAccounts())}
                  className={`recording-storage-option${selected ? " selected" : ""}`}
                >
                  <span className="recording-storage-option-icon">{option.icon}</span>
                  <span className="flex-1">
                    <strong className="block text-sm text-[#163300]">{option.label}</strong>
                    {!enabled ? <small className="text-xs text-[#6b7168]">Tap to connect this account</small> : null}
                  </span>
                  {selected ? <CheckCircleIcon size={18} /> : !enabled ? <CaretRightIcon size={16} className="text-[#6b7168]" /> : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

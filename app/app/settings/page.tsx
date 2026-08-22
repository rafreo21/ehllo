"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentType } from "react";
import { Trash2 as TrashIcon } from "react-feather";
import { ChevronRight as CaretRightIcon } from "react-feather";
import { Bell as BellIcon } from "react-feather";
import { UploadCloud as CloudArrowUpIcon } from "react-feather";
import { CreditCard as IdentificationBadgeIcon } from "react-feather";
import { PlugsIcon } from "@phosphor-icons/react/dist/csr/Plugs";
import { ScanIcon } from "@phosphor-icons/react/dist/csr/Scan";
import { X as XIcon } from "react-feather";
import { Clock as HistoryIcon } from "react-feather";
import { AppShellChromeProvider } from "../../components/AppShellChromeContext";
import { PageSkeleton } from "../../components/AsyncState";

type SettingsLink = { href: string; icon: React.ReactNode; label: string; hint: string };

const SETTINGS_LINKS: SettingsLink[] = [
  { href: "/app/settings/edit-profile", icon: <IdentificationBadgeIcon size={20} />, label: "Edit profile", hint: "Full name and phone number · only visible to you" },
  { href: "/app/settings/recent-scans", icon: <ScanIcon size={20} weight="bold" />, label: "Recent scans", hint: "People who scanned your card but aren't saved yet" },
  { href: "/app/settings/contact-requests", icon: <BellIcon size={20} />, label: "Contact requests", hint: "People asking for a way to reach you" },
  { href: "/app/settings/notifications", icon: <BellIcon size={20} />, label: "Notification preferences", hint: "How ehllo reminds you about follow-ups" },
  { href: "/app/settings/connected-accounts", icon: <PlugsIcon size={20} weight="bold" />, label: "Connected accounts", hint: "Google, Microsoft, and future integrations" },
  { href: "/app/settings/recording-storage", icon: <CloudArrowUpIcon size={20} />, label: "Recording storage", hint: "Where new recordings are stored by default" },
  { href: "/app/settings/local-data", icon: <TrashIcon size={20} />, label: "Local data", hint: "Clear the copy this browser is holding" },
];

const drawerLoader = () => <div className="settings-drawer-loading"><PageSkeleton rows={4} /></div>;
const SETTINGS_PANELS: Record<string, ComponentType> = {
  "/app/settings/edit-profile": dynamic(() => import("./edit-profile/page"), { loading: drawerLoader }),
  "/app/settings/recent-scans": dynamic(() => import("./recent-scans/page"), { loading: drawerLoader }),
  "/app/settings/contact-requests": dynamic(() => import("./contact-requests/page"), { loading: drawerLoader }),
  "/app/settings/notifications": dynamic(() => import("./notifications/page"), { loading: drawerLoader }),
  "/app/settings/connected-accounts": dynamic(() => import("./connected-accounts/page"), { loading: drawerLoader }),
  "/app/settings/recording-storage": dynamic(() => import("./recording-storage/page"), { loading: drawerLoader }),
  "/app/settings/local-data": dynamic(() => import("./local-data/page"), { loading: drawerLoader }),
};

export default function ConsumerSettingsPage() {
  const [activePanel, setActivePanel] = useState<SettingsLink | null>(null);

  useEffect(() => {
    if (!activePanel) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActivePanel(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [activePanel]);

  const ActivePanel = activePanel ? SETTINGS_PANELS[activePanel.href] : null;

  return (
    <>
      <div className="flow-page settings-page">
        <header className="flow-heading">
          <div><h1>My account</h1><p>Manage your profile, review scans, connect accounts, and choose where recordings are stored.</p></div>
        </header>

        <div className="grid gap-3">
          {SETTINGS_LINKS.map((link) => (
            <button
              type="button"
              key={link.href}
              onClick={() => setActivePanel(link)}
              className="flex min-h-[72px] w-full cursor-pointer items-center gap-3 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-5 py-4 text-left font-inherit transition hover:bg-[#f2f5f0]"
            >
              <span className="shrink-0 text-[#163300]">{link.icon}</span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-[#163300]">{link.label}</strong>
                <small className="block text-xs text-[#6b7168]">{link.hint}</small>
              </span>
              <CaretRightIcon size={18} className="shrink-0 text-[#6b7168]" />
            </button>
          ))}
        </div>
      </div>

      {activePanel && ActivePanel ? (
        <div className="settings-drawer-backdrop" role="presentation" onClick={() => setActivePanel(null)}>
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-drawer-title" onClick={(event) => event.stopPropagation()}>
            <header className="settings-drawer-header">
              <div>
                <h2 id="settings-drawer-title">{activePanel.label}</h2>
                <p>{activePanel.hint}</p>
              </div>
              <div className="settings-drawer-header-actions">
                {activePanel.href === "/app/settings/local-data" ? (
                  <button
                    type="button"
                    className="settings-drawer-text-action"
                    onClick={() => window.dispatchEvent(new Event("ehllo:clear-local-data"))}
                  >Clear browser copy</button>
                ) : null}
                {activePanel.href === "/app/settings/contact-requests" ? (
                  <button
                    type="button"
                    aria-label="Contact request history"
                    title="History"
                    onClick={() => window.dispatchEvent(new Event("ehllo:open-contact-request-history"))}
                  ><HistoryIcon size={18} /></button>
                ) : null}
                <button type="button" aria-label="Close" onClick={() => setActivePanel(null)}><XIcon size={18} /></button>
              </div>
            </header>
            <div className="settings-drawer-body">
              <AppShellChromeProvider>
                <ActivePanel />
              </AppShellChromeProvider>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

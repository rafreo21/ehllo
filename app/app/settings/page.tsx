"use client";

import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { CloudArrowUpIcon } from "@phosphor-icons/react/dist/csr/CloudArrowUp";
import { IdentificationBadgeIcon } from "@phosphor-icons/react/dist/csr/IdentificationBadge";
import { PlugsIcon } from "@phosphor-icons/react/dist/csr/Plugs";
import { ScanIcon } from "@phosphor-icons/react/dist/csr/Scan";

const SETTINGS_LINKS: { href: string; icon: React.ReactNode; label: string; hint: string }[] = [
  { href: "/app/settings/edit-profile", icon: <IdentificationBadgeIcon size={20} weight="bold" />, label: "Edit profile", hint: "Full name and phone number" },
  { href: "/app/settings/recent-scans", icon: <ScanIcon size={20} weight="bold" />, label: "Recent scans", hint: "People who scanned your card but aren't saved yet" },
  { href: "/app/settings/notifications", icon: <BellIcon size={20} weight="bold" />, label: "Notification preferences", hint: "How Ehllo reminds you about follow-ups" },
  { href: "/app/settings/connected-accounts", icon: <PlugsIcon size={20} weight="bold" />, label: "Connected accounts", hint: "Google, Microsoft, and future integrations" },
  { href: "/app/settings/recording-storage", icon: <CloudArrowUpIcon size={20} weight="bold" />, label: "Recording storage", hint: "Where new recordings are stored by default" },
];

export default function ConsumerSettingsPage() {
  return (
    <>
      <div className="flow-page settings-page">
        <header className="flow-heading">
          <div><h1>My account</h1><p>Manage your profile, review scans, connect accounts, and choose where recordings are stored.</p></div>
        </header>

        <div className="grid gap-3">
          {SETTINGS_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex min-h-[72px] items-center gap-3 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-5 py-4 no-underline transition hover:bg-[#f2f5f0]"
            >
              <span className="shrink-0 text-[#163300]">{link.icon}</span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-[#163300]">{link.label}</strong>
                <small className="block text-xs text-[#6b7168]">{link.hint}</small>
              </span>
              <CaretRightIcon size={18} weight="bold" className="shrink-0 text-[#6b7168]" />
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

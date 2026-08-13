"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { IdentificationCardIcon } from "@phosphor-icons/react/dist/csr/IdentificationCard";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { IconButton, LinkButton } from "./Button";
import { useAppUser } from "./AppUserContext";
import { useAppShellChromeValue } from "./AppShellChromeContext";
import { BrandMark } from "./BrandMark";
import { hydrateContactsFromServer } from "../../lib/contacts-sync";
import { hydrateEncountersFromServer } from "../../lib/encounters-sync";
import { hydrateCardLibraryFromServer } from "../../lib/card-library-sync";
import { NotificationBell } from "./NotificationBell";
import { ActiveCaptureBar } from "./ActiveCaptureBar";

export type AppShellActive = "home" | "people" | "cards" | "capture" | "scan" | "followups" | "settings";

type AppShellProps = {
  children: ReactNode;
};

function deriveActive(pathname: string): AppShellActive {
  if (pathname.startsWith("/app/cards") || pathname.startsWith("/app/card/")) return "cards";
  if (pathname.startsWith("/app/encounters/new")) return "capture";
  if (pathname.startsWith("/app/scan")) return "scan";
  if (pathname.startsWith("/app/followups")) return "followups";
  if (pathname.startsWith("/app/people")) return "people";
  if (pathname.startsWith("/app/settings")) return "settings";
  return "home";
}

const consumerNav = [
  ["home", "/app", HouseIcon, "Home"],
  ["cards", "/app/cards", IdentificationCardIcon, "My card"],
  ["capture", "/app/encounters/new", MicrophoneIcon, "Capture"],
  ["scan", "/app/scan", QrCodeIcon, "Scan"],
  ["followups", "/app/followups", PaperPlaneTiltIcon, "Follow-ups"],
  ["people", "/app/people", UsersThreeIcon, "Connections"],
  ["settings", "/app/settings", UserCircleIcon, "My account"],
] as const;

let hydratedConsumerUser = "";

export function AppShell({ children }: AppShellProps) {
  const user = useAppUser();
  const pathname = usePathname();
  const active = deriveActive(pathname);
  const { backHref, backLabel = "Back", actions } = useAppShellChromeValue();
  const [mobileNav, setMobileNav] = useState(false);
  const [actionableCount, setActionableCount] = useState(0);
  const updateActionableCount = useCallback((count: number) => setActionableCount(count), []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    if (hydratedConsumerUser === user.email) return;
    hydratedConsumerUser = user.email;
    void hydrateContactsFromServer();
    void hydrateEncountersFromServer();
    void hydrateCardLibraryFromServer();
  }, [user.email]);
  const label = user.displayName || user.email.split("@")[0] || "ehllo user";
  const initials = label.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  const renderNavItem = ([key, href, Icon, itemLabel]: (typeof consumerNav)[number]) => (
    <a className={active === key ? "active" : ""} href={href} key={key} onClick={() => setMobileNav(false)}>
      <Icon size={20} weight="bold" /> <span>{itemLabel}</span>
      {key === "followups" && actionableCount ? <b className="nav-count" aria-label={`${actionableCount} due follow-ups`}>{actionableCount > 99 ? "99+" : actionableCount}</b> : null}
    </a>
  );

  return (
    <main className="product-shell">
      <aside className={`product-sidebar consumer-sidebar ${mobileNav ? "open" : ""}`}>
        <a className="product-logo" href="/app"><BrandMark size={38} /><strong>ehllo</strong></a>
        <nav aria-label="Consumer navigation">
          {consumerNav.map(renderNavItem)}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <span>{initials || "AM"}</span>
            <div>{label}<small>{user.email}</small></div>
            <form action="/auth/signout" method="post">
              <IconButton type="submit" aria-label="Sign out" title="Sign out"><SignOutIcon weight="bold" /></IconButton>
            </form>
          </div>
        </div>
      </aside>

      <section className="product-main">
        <div className="consumer-global-bell"><NotificationBell onActionableCountChange={updateActionableCount} /></div>
        <ActiveCaptureBar />
        <header className="product-mobile-header">
          <IconButton className="menu-button" aria-label="Toggle navigation" onClick={() => setMobileNav(!mobileNav)}>
            <ListIcon size={25} weight="bold" />
          </IconButton>
          <span className="mobile-logo">ehllo</span>
        </header>
        <div className="product-content">
          {backHref || actions ? (
            <div className="product-page-toolbar">
              {backHref ? (
                <LinkButton size="small" variant="ghost" href={backHref} className="product-page-back">
                  <ArrowLeftIcon size={16} weight="bold" />{backLabel}
                </LinkButton>
              ) : <span />}
              {actions ? <div className="product-page-actions">{actions}</div> : null}
            </div>
          ) : null}
          {children}
        </div>
      </section>
    </main>
  );
}

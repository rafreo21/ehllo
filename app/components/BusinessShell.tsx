"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { IdentificationCardIcon } from "@phosphor-icons/react/dist/csr/IdentificationCard";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { IconButton } from "./Button";
import { useAppUser } from "./AppUserContext";
import { BrandMark } from "./BrandMark";
import { hydrateContactsFromServer } from "../../lib/contacts-sync";
import { hydrateEncountersFromServer } from "../../lib/encounters-sync";
import { hydrateCardLibraryFromServer } from "../../lib/card-library-sync";

export type BusinessShellActive = "home" | "cards" | "contacts" | "activate" | "outbound";

type BusinessShellProps = {
  active: BusinessShellActive;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const nav = [
  ["home", "/business", HouseIcon, "Home"],
  ["cards", "/business/cards", IdentificationCardIcon, "My card"],
  ["contacts", "/business/contacts", UsersThreeIcon, "Contacts CRM"],
  ["activate", "/business/activate", ChartLineUpIcon, "Activate"],
  ["outbound", "/business/outbound", PaperPlaneTiltIcon, "Outbound"],
] as const;

export function BusinessShell({ active, title, subtitle, actions, children }: BusinessShellProps) {
  const user = useAppUser();
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    void hydrateContactsFromServer();
    void hydrateEncountersFromServer();
    void hydrateCardLibraryFromServer();
  }, []);
  const label = user.displayName || user.email.split("@")[0] || "Ehllo user";
  const initials = label.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  return (
    <main className="product-shell">
      <aside className={`product-sidebar ${mobileNav ? "open" : ""}`}>
        <a className="product-logo" href="/business">
          <BrandMark size={38} />
          <strong>Ehllo Business</strong>
        </a>
        <nav aria-label="Business navigation">
          <p className="nav-group-label">Business</p>
          {nav.map(([key, href, Icon, itemLabel]) => (
            <a className={active === key ? "active" : ""} href={href} key={key}>
              <Icon size={20} weight="bold" /> {itemLabel}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/app">Consumer app</a>
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
        <header className="product-header">
          <IconButton className="menu-button" aria-label="Toggle navigation" onClick={() => setMobileNav(!mobileNav)}>
            <ListIcon size={25} weight="bold" />
          </IconButton>
          <div>
            <span className="mobile-logo">Ehllo Business</span>
            <strong className="header-title">{title}</strong>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="header-actions">{actions}</div>
        </header>
        <div className="product-content">{children}</div>
      </section>
    </main>
  );
}

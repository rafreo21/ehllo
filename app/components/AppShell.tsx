"use client";

import { purgeWebLocalDataIfAccountChanged } from "../../lib/web-local-data";
import type { IconComponent } from "../../lib/icon-component";
import { useCallback, useEffect, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Home as HouseIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { Menu as MenuIcon } from "react-feather";
import { Send as PaperPlaneTiltIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { Users as UsersThreeIcon } from "react-feather";
import { LogOut as SignOutIcon } from "react-feather";
import { User as UserCircleIcon } from "react-feather";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { IconButton, LinkButton } from "./Button";
import { useAppUser } from "./AppUserContext";
import { useAppShellChromeValue } from "./AppShellChromeContext";
import { BrandMark } from "./BrandMark";
import { hydrateContactsFromServer } from "../../lib/contacts-sync";
import { hydrateEncountersFromServer } from "../../lib/encounters-sync";
import { hydrateCardLibraryFromServer } from "../../lib/card-library-sync";
import { NotificationBell } from "./NotificationBell";
import { CardImage } from "./CardImage";
import { CARD_LIBRARY_CHANGE_EVENT, readCardLibrary, type LibraryCard } from "../../lib/card-library";

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

// "scan" alone still renders a Phosphor icon (QrCode has no react-feather
// equivalent), so it alone keeps the `weight="bold"` prop in renderNavItem below.
const consumerNav: ReadonlyArray<readonly [string, string, IconComponent, string]> = [
  ["home", "/app", HouseIcon, "Home"],
  ["cards", "/app/cards", IdentificationCardIcon, "My Cards"],
  ["people", "/app/people", UsersThreeIcon, "Connections"],
  ["followups", "/app/followups", PaperPlaneTiltIcon, "Follow-ups"],
  ["scan", "/app/scan", QrCodeIcon, "Scan"],
  ["settings", "/app/settings", UserCircleIcon, "My account"],
];

let hydratedConsumerUser = "";

export function AppShell({ children }: AppShellProps) {
  const user = useAppUser();
  const pathname = usePathname();
  const active = deriveActive(pathname);
  const { backHref, backLabel = "Back", leading, actions, requestNavigation } = useAppShellChromeValue();
  const [mobileNav, setMobileNav] = useState(false);
  const [actionableCount, setActionableCount] = useState(0);
  const [primaryCard, setPrimaryCard] = useState<LibraryCard | null>(null);
  const updateActionableCount = useCallback((count: number) => setActionableCount(count), []);
  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileNav(false);
  }, [pathname]);
  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNav(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNav]);
  useEffect(() => {
    if (hydratedConsumerUser === user.email) return;
    hydratedConsumerUser = user.email;
    // Before pulling anything down, throw away a previous account's copy. The web
    // keeps cards, contacts and encounters in localStorage so screens render
    // instantly, and none of it was scoped to a person - so it survived signing out,
    // signing in as somebody else, and a full server-side purge. Hydrating on top of
    // that merges the two rather than replacing one.
    purgeWebLocalDataIfAccountChanged(user.id || user.email);
    void hydrateContactsFromServer();
    void hydrateEncountersFromServer();
    void hydrateCardLibraryFromServer().then((cards) => {
      setPrimaryCard(cards.find((card) => card.isPrimary) || cards.find((card) => card.status === "published") || cards[0] || null);
    });
  }, [user.email, user.id]);
  useEffect(() => {
    const refreshPrimaryCard = () => {
      const cards = readCardLibrary(localStorage);
      setPrimaryCard(cards.find((card) => card.isPrimary) || cards.find((card) => card.status === "published") || cards[0] || null);
    };
    refreshPrimaryCard();
    window.addEventListener(CARD_LIBRARY_CHANGE_EVENT, refreshPrimaryCard);
    window.addEventListener("storage", refreshPrimaryCard);
    return () => {
      window.removeEventListener(CARD_LIBRARY_CHANGE_EVENT, refreshPrimaryCard);
      window.removeEventListener("storage", refreshPrimaryCard);
    };
  }, [user.email, user.id]);
  const label = user.displayName || user.email.split("@")[0] || "ehllo user";
  const initials = label.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  const navigateWithPrompt = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string, action: () => void) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.altKey
      || event.shiftKey
      || event.metaKey
      || event.ctrlKey
    ) return;
    event.preventDefault();
    if (requestNavigation) {
      requestNavigation(href, action);
      return;
    }
    action();
  }, [requestNavigation]);

  const renderNavItem = ([key, href, Icon, itemLabel]: (typeof consumerNav)[number]) => (
    <a
      className={active === key ? "active" : ""}
      href={href}
      key={key}
      onClick={(event) => {
        navigateWithPrompt(event, href, () => {
          setMobileNav(false);
          window.location.href = href;
        });
      }}
    >
      {key === "scan" ? <Icon size={20} weight="bold" /> : <Icon size={20} />} <span>{itemLabel}</span>
      {key === "followups" && actionableCount ? <b className="nav-count" aria-label={`${actionableCount} due follow-ups`}>{actionableCount > 99 ? "99+" : actionableCount}</b> : null}
    </a>
  );

  return (
    <main className="product-shell">
      {mobileNav ? <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} /> : null}
      <aside id="consumer-mobile-navigation" className={`product-sidebar consumer-sidebar ${mobileNav ? "open" : ""}`} aria-label="Main navigation">
        <button type="button" className="mobile-nav-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><XIcon size={18} /></button>
        <a
          className="product-logo"
          href="/app"
          onClick={(event) => {
            navigateWithPrompt(event, "/app", () => {
              window.location.href = "/app";
            });
          }}
        >
          <BrandMark size={38} /><strong>ehllo</strong>
        </a>
        <nav aria-label="Consumer navigation">
          {consumerNav.map(renderNavItem)}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <span>{initials || "AM"}</span>
            <div>{label}<small>{user.email}</small></div>
            <form action="/auth/signout" method="post">
              <IconButton type="submit" aria-label="Sign out" title="Sign out"><SignOutIcon /></IconButton>
            </form>
          </div>
        </div>
      </aside>

      <section className="product-main">
        <div className="consumer-topbar">
          <NotificationBell onActionableCountChange={updateActionableCount} />
          <a
            className="consumer-topbar-avatar"
            href="/app/settings"
            aria-label="My account"
            onClick={(event) => {
              navigateWithPrompt(event, "/app/settings", () => {
                window.location.href = "/app/settings";
              });
            }}
          >
            <CardImage src={primaryCard?.photo} alt="" fallback={<span>{initials || "AM"}</span>} />
          </a>
        </div>
        <header className="product-mobile-header">
          <IconButton className="menu-button" aria-label="Open navigation" aria-expanded={mobileNav} aria-controls="consumer-mobile-navigation" onClick={() => setMobileNav(true)}>
            <MenuIcon size={24} />
          </IconButton>
        </header>
        <div className="product-content">
          {backHref || leading || actions ? (
            <div className="product-page-toolbar">
              <div className="product-page-leading">
                {backHref ? (
                  <LinkButton
                    size="small"
                    variant="ghost"
                    href={backHref}
                    className="product-page-back"
                    onClick={(event) => {
                      navigateWithPrompt(event, backHref, () => {
                        window.location.href = backHref;
                      });
                    }}
                  >
                    <ArrowLeftIcon size={16} />{backLabel}
                  </LinkButton>
                ) : null}
                {leading}
              </div>
              {actions ? <div className="product-page-actions">{actions}</div> : null}
            </div>
          ) : null}
          {children}
        </div>
      </section>
    </main>
  );
}

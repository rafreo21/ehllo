"use client";

import { Smartphone as DeviceMobileIcon, X as XIcon } from "react-feather";
import { LinkButton } from "./Button";
import {
  detectMobilePlatform,
  getAppStoreUrl,
  getBetaSignupUrl,
  getPlayStoreUrl,
  hasPublishedMobileApp,
} from "../../lib/app-store-links";

/**
 * Widgets are a phone home-screen feature, so the web can only ever show what they look like.
 *
 * The widgets tool used to end with instructions that began "install and open ehllo once" and
 * no way to do that - a set of directions whose first step was somewhere else entirely. This
 * offers both stores, rather than guessing a platform, because somebody reading this on a
 * laptop is very often installing on a phone that is not the machine in front of them.
 */
export function WidgetsOnPhoneModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const platform = detectMobilePlatform();
  const appStoreUrl = getAppStoreUrl();
  const playStoreUrl = getPlayStoreUrl();
  const storesLive = hasPublishedMobileApp();
  const betaSignupUrl = getBetaSignupUrl();
  // Their own platform leads when we can tell; both stay visible either way.
  const androidFirst = platform === "android";

  const stores = [
    appStoreUrl ? { key: "ios", href: appStoreUrl, label: "Download for iPhone" } : null,
    playStoreUrl ? { key: "android", href: playStoreUrl, label: "Download for Android" } : null,
  ].filter(Boolean) as Array<{ key: string; href: string; label: string }>;
  if (androidFirst) stores.reverse();

  return (
    <div className="connections-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="connections-modal connections-modal-compact"
        role="dialog"
        aria-label="Widgets on your phone"
        onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>Widgets live on your phone</h2>
          <button type="button" aria-label="Close" onClick={onClose}><XIcon size={18} /></button>
        </header>
        <p className="widgets-modal-lede">
          <DeviceMobileIcon size={16} aria-hidden="true" />{" "}
          Your card, a scan button and your recent connections, one tap from the home screen.
          {storesLive
            ? " Install ehllo, open it once, then add the widget from your home screen."
            : " The app is still in testing - join it and widgets come with it."}
        </p>
        <div className="connections-add-options" style={{ flexDirection: "column", alignItems: "stretch" }}>
          {storesLive && stores.length
            ? stores.map((store) => (
                <LinkButton
                  key={store.key}
                  size="small"
                  href={store.href}
                  target="_blank"
                  rel="noreferrer"
                  variant={store.key === stores[0].key ? "primary" : "secondary"}>
                  {store.label}
                </LinkButton>
              ))
            : betaSignupUrl
              ? (
                <LinkButton size="small" href={betaSignupUrl} target="_blank" rel="noreferrer">
                  Apply to join the test
                </LinkButton>
              )
              : null}
          <button type="button" className="ghost-link" onClick={onClose}>Not now</button>
        </div>
      </div>
    </div>
  );
}

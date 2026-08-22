"use client";

import { Mail as MailIcon, Phone as PhoneIcon, PlusCircle as PlusCircleIcon, Smartphone as DeviceMobileIcon, X as XIcon } from "react-feather";
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
type WidgetPreviewCard = {
  qrDataUrl?: string;
  name?: string;
  role?: string;
  company?: string;
  photoUrl?: string;
  connectionName?: string;
  connectionSubtitle?: string;
  connectionPhotoUrl?: string;
  connectionHasPhone?: boolean;
  connectionHasEmail?: boolean;
};

export function WidgetsOnPhoneModal({
  open,
  onClose,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  preview?: WidgetPreviewCard;
}) {
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
        <div className="widget-previews">
          <div className="widget-preview">
            <div className="widget-preview-frame">
              <div className="widget-preview-qr">
                <span>{preview?.qrDataUrl ? <img src={preview.qrDataUrl} alt="Your card's QR code" /> : null}</span>
              </div>
            </div>
            <span className="widget-preview-caption">QR Scan · one tap to share</span>
          </div>

          <div className="widget-preview">
            <div className="widget-preview-frame">
              <div className="widget-preview-card">
                <span className="widget-preview-card-qr">
                  {preview?.qrDataUrl ? <img src={preview.qrDataUrl} alt="" aria-hidden="true" /> : null}
                </span>
                <div className="widget-preview-card-copy">
                  <span className="widget-preview-name widget-preview-truncate">{preview?.name || "Your name"}</span>
                  <span className="widget-preview-role widget-preview-truncate">{preview?.role || "Your role"}</span>
                  {preview?.company ? (
                    <span className="widget-preview-company widget-preview-truncate">{preview.company}</span>
                  ) : null}
                </div>
              </div>
            </div>
            <span className="widget-preview-caption">Business Card · your primary card</span>
          </div>

          <div className="widget-preview">
            <div className="widget-preview-frame">
              <div className="widget-preview-rows">
                <span className="widget-preview-eyebrow">Recent Connections</span>
                <div className="widget-preview-row">
                  <span className="widget-preview-avatar">
                    {preview?.connectionPhotoUrl
                      ? <img src={preview.connectionPhotoUrl} alt="" aria-hidden="true" />
                      : (preview?.connectionName?.trim().charAt(0).toUpperCase() || "")}
                  </span>
                  <span className="widget-preview-row-copy">
                    <span className="widget-preview-name widget-preview-truncate">
                      {preview?.connectionName || "Your connections"}
                    </span>
                    <span className="widget-preview-role widget-preview-truncate">
                      {preview?.connectionSubtitle || "Appear here after you share"}
                    </span>
                  </span>
                  {/* Shown only when the widget would show them - it hides an action it has no
                      number or address for. */}
                  {preview?.connectionHasPhone ? (
                    <span className="widget-preview-chip"><PhoneIcon size={11} /></span>
                  ) : null}
                  {preview?.connectionHasEmail || preview?.connectionHasPhone ? (
                    <span className="widget-preview-chip"><MailIcon size={11} /></span>
                  ) : null}
                </div>
                <span className="widget-preview-pill"><PlusCircleIcon size={11} /> Add new connection</span>
              </div>
            </div>
            <span className="widget-preview-caption">Recent Connections · call or email in a tap</span>
          </div>
        </div>
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

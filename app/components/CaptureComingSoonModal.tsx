"use client";

import { Mic as MicrophoneIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { LinkButton } from "./Button";
import {
  detectMobilePlatform,
  getAppStoreUrl,
  getBetaSignupUrl,
  getPlayStoreUrl,
  hasPublishedMobileApp,
} from "../../lib/app-store-links";

// Capture is mobile-only on the web consumer dashboard — every "Capture"
// entry point here should offer the app instead of the real capture flow.
export function CaptureComingSoonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const platform = detectMobilePlatform();
  const playStoreUrl = getPlayStoreUrl();
  const appStoreUrl = getAppStoreUrl();
  const storesLive = hasPublishedMobileApp();
  const preferAndroid = platform === "android" && playStoreUrl;
  const storeHref = preferAndroid ? playStoreUrl : (appStoreUrl || playStoreUrl);
  const betaSignupUrl = getBetaSignupUrl();

  return (
    <div className="connections-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="connections-modal connections-modal-compact" role="dialog" aria-label="Capture on mobile" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>Capture is on mobile</h2>
          <button type="button" aria-label="Close" onClick={onClose}><XIcon size={18} /></button>
        </header>
        <p>
          {storesLive
            ? "Recording and transcribing conversations lives in the ehllo mobile app."
            : "Recording and transcribing conversations is coming to the ehllo mobile app."}
        </p>
        <div className="connections-add-options">
          {storesLive && storeHref ? (
            <LinkButton size="small" href={storeHref} target="_blank" rel="noreferrer" onClick={onClose}>
              Get the app
            </LinkButton>
          ) : betaSignupUrl ? (
            <LinkButton size="small" href={betaSignupUrl} target="_blank" rel="noreferrer" onClick={onClose}>
              Apply to join the test
            </LinkButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

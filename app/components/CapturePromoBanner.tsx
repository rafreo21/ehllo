"use client";

import { Mic as MicrophoneIcon } from "react-feather";
import { AppleLogoIcon } from "@phosphor-icons/react/dist/csr/AppleLogo";
import { GooglePlayLogoIcon } from "@phosphor-icons/react/dist/csr/GooglePlayLogo";
import { ChevronRight as CaretRightIcon } from "react-feather";
import { getAppStoreUrl, getPlayStoreUrl, detectMobilePlatform, hasPublishedMobileApp } from "@/lib/app-store-links";

export function CapturePromoBanner({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const platform = detectMobilePlatform();
  const playStoreUrl = getPlayStoreUrl();
  const appStoreUrl = getAppStoreUrl();
  const storesLive = hasPublishedMobileApp();
  const preferAndroid = platform === "android" && playStoreUrl;
  const storeHref = preferAndroid ? playStoreUrl : (appStoreUrl || playStoreUrl);
  const StoreIcon = preferAndroid ? GooglePlayLogoIcon : AppleLogoIcon;

  const className = `capture-promo${compact ? " capture-promo-compact" : ""}`;
  const copy = (
    <>
      <span className="capture-promo-icon"><MicrophoneIcon size={20} /></span>
      <div className="capture-promo-copy">
        <strong>Do more with Capture</strong>
        <span>Record a conversation and ehllo remembers it for you — {storesLive ? "in the ehllo mobile app" : "coming soon to the ehllo mobile app"}.</span>
      </div>
    </>
  );

  // When a click handler is passed (e.g. to open a shared "get the app"
  // modal), the banner always routes through it instead of navigating —
  // keeps every "Capture" entry point on a page consistent.
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {copy}
        <CaretRightIcon size={16} className="capture-promo-chevron" />
      </button>
    );
  }

  if (!storesLive || !storeHref) {
    return (
      <div className={`${className} capture-promo-pending`}>
        {copy}
        <CaretRightIcon size={16} className="capture-promo-chevron" />
      </div>
    );
  }

  return (
    <a className={className} href={storeHref} target="_blank" rel="noreferrer">
      {copy}
      <StoreIcon size={20} weight="fill" />
    </a>
  );
}

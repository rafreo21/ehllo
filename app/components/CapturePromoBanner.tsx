"use client";

import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { AppleLogoIcon } from "@phosphor-icons/react/dist/csr/AppleLogo";
import { GooglePlayLogoIcon } from "@phosphor-icons/react/dist/csr/GooglePlayLogo";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { getAppStoreUrl, getPlayStoreUrl, detectMobilePlatform, hasPublishedMobileApp } from "@/lib/app-store-links";

export function CapturePromoBanner({ compact = false }: { compact?: boolean }) {
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
      <span className="capture-promo-icon"><MicrophoneIcon size={20} weight="fill" /></span>
      <div className="capture-promo-copy">
        <strong>Do more with Capture</strong>
        <span>Record a conversation and ehllo remembers it for you — {storesLive ? "in the ehllo mobile app" : "coming soon to the ehllo mobile app"}.</span>
      </div>
    </>
  );

  if (!storesLive || !storeHref) {
    return (
      <div className={`${className} capture-promo-pending`}>
        {copy}
        <CaretRightIcon size={16} weight="bold" className="capture-promo-chevron" />
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

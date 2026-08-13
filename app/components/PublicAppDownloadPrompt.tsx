"use client";

import { AppleLogoIcon } from "@phosphor-icons/react/dist/csr/AppleLogo";
import { GooglePlayLogoIcon } from "@phosphor-icons/react/dist/csr/GooglePlayLogo";
import { DeviceMobileIcon } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { LinkButton } from "./Button";
import { buildAuthHref } from "@/lib/auth/visitor-intent";
import { getAppStoreUrl, getPlayStoreUrl, detectMobilePlatform, hasPublishedMobileApp } from "@/lib/app-store-links";

export function PublicAppDownloadPrompt({
  ownerName,
  visitorEmail,
  slug,
  onClose,
}: {
  ownerName: string;
  visitorEmail?: string;
  slug?: string;
  onClose?: () => void;
}) {
  const platform = detectMobilePlatform();
  const playStoreUrl = getPlayStoreUrl();
  const appStoreUrl = getAppStoreUrl();
  const storesLive = hasPublishedMobileApp();
  const webAuthHref = buildAuthHref({
    intent: "visitor",
    slug: slug ?? "",
    email: visitorEmail?.trim().toLowerCase(),
  });

  return (
    <div className="public-app-download" role="dialog" aria-modal="true" aria-labelledby="app-download-title">
      <div className="public-app-download-card">
        <div className="public-app-download-icon">
          <DeviceMobileIcon size={34} weight="bold" />
        </div>
        <h2 id="app-download-title">You&apos;re all set</h2>
        <p>
          {ownerName} has your details.
          {visitorEmail
            ? ` Sign in with ${visitorEmail} on Ehllo to keep everyone you meet in one place.`
            : " Sign in on Ehllo to keep everyone you meet in one place."}
        </p>

        <div className="public-app-download-actions">
          {storesLive ? (
            <>
              {(platform === "android" || platform === "unknown") && playStoreUrl ? (
                <LinkButton fullWidth href={playStoreUrl} target="_blank" rel="noreferrer">
                  <GooglePlayLogoIcon size={20} weight="fill" />
                  Get it on Google Play
                </LinkButton>
              ) : null}
              {(platform === "ios" || platform === "unknown") && appStoreUrl ? (
                <LinkButton fullWidth variant="secondary" href={appStoreUrl} target="_blank" rel="noreferrer">
                  <AppleLogoIcon size={20} weight="fill" />
                  Download on the App Store
                </LinkButton>
              ) : null}
            </>
          ) : (
            <>
              <LinkButton fullWidth href={webAuthHref}>
                Continue on the web
                <ArrowRightIcon size={18} weight="bold" />
              </LinkButton>
              <p className="public-app-download-note">The mobile app is coming soon. Use the web for now. Same account, same people.</p>
            </>
          )}
        </div>

        {onClose ? (
          <button type="button" className="ghost-link public-app-download-close" onClick={onClose}>
            Back to {ownerName}&apos;s card
          </button>
        ) : null}
      </div>
    </div>
  );
}

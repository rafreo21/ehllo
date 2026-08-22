"use client";

import { GoogleProviderIcon } from "./ProviderIcons";
import { Users as UsersThreeIcon } from "react-feather";
import { buildAuthHref, scanSourceFromLocation } from "../../lib/auth/visitor-intent";
import { LinkButton } from "../components/Button";

export function VisitorSignInPrompt({
  slug,
  ownerName,
  exchangeId,
  shareToken,
  compact = false,
}: {
  slug: string;
  ownerName: string;
  exchangeId?: string;
  shareToken?: string;
  compact?: boolean;
}) {
  // Carries the surface through, so signing in from an NFC tap is recorded as a tap
  // rather than collapsing into "web" like every other browser arrival.
  const authHref = buildAuthHref({
    intent: "visitor",
    slug,
    exchangeId,
    shareToken,
    source: scanSourceFromLocation(),
  });

  return (
    <section className={`visitor-signin-prompt ${compact ? "compact" : ""}`}>
      <div>
        <span className="step-pill"><UsersThreeIcon size={12} /> People you&apos;ve met</span>
        <strong>{compact ? "Save this connection in ehllo" : `Keep ${ownerName} in your directory`}</strong>
        <p>{compact ? `Sign in to keep ${ownerName} and your shared details together.` : "Sign in with Google to save cards and shared meeting records. No full CRM setup."}</p>
      </div>
      <LinkButton href={authHref} variant="secondary">
        <GoogleProviderIcon size={18} />
        Continue with Google
      </LinkButton>
    </section>
  );
}

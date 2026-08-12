"use client";

import { GoogleProviderIcon } from "./ProviderIcons";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { buildAuthHref } from "../../lib/auth/visitor-intent";
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
  const authHref = buildAuthHref({ intent: "visitor", slug, exchangeId, shareToken });

  return (
    <section className={`visitor-signin-prompt ${compact ? "compact" : ""}`}>
      <div>
        <span className="step-pill"><UsersThreeIcon size={12} weight="bold" /> People you&apos;ve met</span>
        <strong>{compact ? "Remember this connection" : `Keep ${ownerName} in your directory`}</strong>
        <p>Sign in with Google to save cards and shared meeting records. No full CRM setup.</p>
      </div>
      <LinkButton href={authHref} variant="secondary">
        <GoogleProviderIcon size={18} />
        Continue with Google
      </LinkButton>
    </section>
  );
}

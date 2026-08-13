import { redirect } from "next/navigation";

import { getAppUser } from "../../../lib/auth/context";
import { parseVisitorIntent } from "../../../lib/auth/visitor-intent";
import { BrandMark } from "../../components/BrandMark";
import { VisitorOnboardingForm } from "../VisitorOnboardingForm";
import "../../app/product.css";
import "../../app/flow.css";

export default async function VisitorOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; exchangeId?: string; shareToken?: string }>;
}) {
  const user = await getAppUser();
  if (!user) redirect("/auth?intent=visitor");
  if (user.onboardingStatus === "completed") redirect("/app/people");
  const params = await searchParams;
  const intent = parseVisitorIntent(new URLSearchParams({
    intent: "visitor",
    ...(params.slug ? { slug: params.slug } : {}),
    ...(params.exchangeId ? { exchangeId: params.exchangeId } : {}),
    ...(params.shareToken ? { shareToken: params.shareToken } : {}),
  }));

  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel onboarding-profile">
        <header className="onboarding-header">
          <a className="onboarding-brand" href="/"><BrandMark size={40} /></a>
        </header>
        <div className="onboarding-intro">
          <h1>Remember who you meet.</h1>
          <p>Confirm your name and Ehllo will keep your card exchanges and shared meeting records in one directory.</p>
        </div>
        <VisitorOnboardingForm
          initialName={user.displayName ?? ""}
          slug={intent?.slug}
          exchangeId={intent?.exchangeId}
          shareToken={intent?.shareToken}
        />
      </section>
    </main>
  );
}

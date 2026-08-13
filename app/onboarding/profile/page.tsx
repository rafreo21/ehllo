import { redirect } from "next/navigation";

import { getAppUser } from "../../../lib/auth/context";
import { BrandMark } from "../../components/BrandMark";
import { OnboardingForm } from "../OnboardingForm";
import "../../app/product.css";
import "../../app/flow.css";

export default async function OnboardingProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await getAppUser();
  if (!user) redirect("/auth");
  if (user.onboardingStatus === "completed") redirect("/app");

  const params = await searchParams;
  const mode = params.mode === "team" ? "team" : "personal";

  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel onboarding-profile">
        <header className="onboarding-header">
          <a className="onboarding-brand" href="/"><BrandMark size={40} />ehllo</a>
        </header>
        <div className="onboarding-intro">
          <h1>{mode === "team" ? "Set up your team workspace." : "Almost there."}</h1>
          <p>
            {mode === "team"
              ? "Confirm your name so teammates know who created the workspace. You can invite members and create branded cards next."
              : "Confirm your name and we’ll take you straight to your card."}
          </p>
        </div>
        <OnboardingForm
          initialName={user.displayName ?? ""}
          mode={mode}
          redirectTo={mode === "team" ? "/app" : "/onboarding/card"}
        />
      </section>
    </main>
  );
}

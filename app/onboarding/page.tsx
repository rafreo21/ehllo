import { redirect } from "next/navigation";
import { getAppUser } from "../../lib/auth/context";
import { OnboardingUseCase } from "./OnboardingUseCase";
import { BrandMark } from "../components/BrandMark";
import "../app/product.css";
import "../app/flow.css";

export default async function OnboardingPage() {
  const user = await getAppUser();
  if (!user) redirect("/auth");
  if (user.onboardingStatus === "completed") redirect("/app");
  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel onboarding-start">
        <header className="onboarding-header">
          <a className="onboarding-brand" href="/"><BrandMark size={40} />ehllo</a>
        </header>
        <div className="onboarding-intro">
          <h1>How will you use ehllo?</h1>
          <p>This helps us tailor the right first step: a personal card for solo networking, or a shared workspace for your team.</p>
        </div>
        <OnboardingUseCase />
      </section>
    </main>
  );
}

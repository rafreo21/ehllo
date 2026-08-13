import { redirect } from "next/navigation";

import { getAppUser } from "../../../lib/auth/context";
import { createClient } from "../../../lib/supabase/server";
import { BrandMark } from "../../components/BrandMark";
import { FirstCardForm } from "../FirstCardForm";
import "../../app/product.css";
import "../../app/flow.css";

async function initialIdentity(user: NonNullable<Awaited<ReturnType<typeof getAppUser>>>) {
  if (user.displayName?.trim()) {
    return { name: user.displayName.trim(), email: user.email };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const metadata = data.user?.user_metadata ?? {};
  const oauthName = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string"
      ? metadata.name
      : "";
  return { name: oauthName.trim(), email: user.email };
}

export default async function OnboardingCardPage() {
  const user = await getAppUser();
  if (!user) redirect("/auth");
  if (user.onboardingStatus === "completed") redirect("/app/cards");

  const { name, email } = await initialIdentity(user);

  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel onboarding-card">
        <header className="onboarding-header">
          <a className="onboarding-brand" href="/"><BrandMark size={40} />Ehllo</a>
        </header>
        <div className="onboarding-intro">
          <h1>Create your first card.</h1>
          <p>Share who you are in one tap. Ehllo uses this when you meet someone new, then helps you remember the conversation.</p>
        </div>
        <FirstCardForm initialName={name} initialEmail={email} />
      </section>
    </main>
  );
}

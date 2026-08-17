import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAppUser } from "../../lib/auth/context";
import { AppUserProvider } from "../components/AppUserContext";
import { AppShell } from "../components/AppShell";
import { AppShellChromeProvider } from "../components/AppShellChromeContext";
import { ToastProvider } from "../components/ToastContext";
import "./product.css";
import "./flow.css";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await requireAppUser();
  if (user.onboardingStatus !== "completed") redirect("/onboarding");
  return (
    <AppUserProvider user={user}>
      <AppShellChromeProvider>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </AppShellChromeProvider>
    </AppUserProvider>
  );
}

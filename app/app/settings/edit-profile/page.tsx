"use client";

import { useEffect, useState } from "react";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { CreditCard as IdentificationBadgeIcon } from "react-feather";
import { Shield as ShieldCheckIcon } from "react-feather";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { Button } from "../../../components/Button";
import { FormSection, TextField } from "../../../components/FormField";
import { PhoneField } from "../../../components/PhoneField";
import { PageSkeleton, StatusMessage } from "../../../components/AsyncState";
import { useToast } from "../../../components/ToastContext";

type AccountProfile = {
  displayName: string;
  primaryEmail: string;
  phone: string;
  phoneVerified: boolean;
  emailVerified: boolean;
};

export default function EditProfilePage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verifyNoticeOpen, setVerifyNoticeOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/profile")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Could not load your account.");
        if (cancelled) return;
        const result = payload as AccountProfile;
        setProfile(result);
        setDisplayName(result.displayName);
        setPhone(result.phone);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load your account.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, phone }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save your account details.");
      setProfile((current) => current && {
        ...current,
        displayName: payload.displayName,
        phone: payload.phone,
        phoneVerified: payload.phoneVerified,
      });
      const text = "Your account details are saved.";
      setSuccess(text);
      showToast({ tone: "success", message: text });
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Could not save your account details.";
      setError(text);
      showToast({ tone: "error", message: text });
    } finally {
      setSaving(false);
    }
  }

  useAppShellChrome({ backHref: "/app/settings", backLabel: "Settings" });
  return (
    <>
      <div className="flow-page settings-page">
        <header className="flow-heading">
          <div><h1>Edit profile</h1><p>These details are for your account only. Your public card is separate - edit it anytime from My card.</p></div>
        </header>

        {loading ? <PageSkeleton rows={2} /> : (
          <form onSubmit={save} className="grid gap-5">
            <FormSection
              title="Your details"
              description="Shown only to you, never shared publicly."
              icon={<IdentificationBadgeIcon size={18} />}
            >
              <TextField
                inline
                label="Full name"
                name="displayName"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />

              <div className="account-inline-value">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-base text-[#0e0f0c]">{profile?.primaryEmail || "-"}</span>
                  {profile?.emailVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#e2f6d5] px-2 py-0.5 text-xs font-bold text-[#163300]">
                      <CheckCircleIcon size={13} /> Verified
                    </span>
                  ) : null}
                </div>
                <small>Signed-in email</small>
              </div>

              <div className="grid gap-2">
                <PhoneField inline label="Phone number" value={phone} onChange={setPhone} />
                <button
                  type="button"
                  disabled={Boolean(profile?.phoneVerified)}
                  onClick={() => setVerifyNoticeOpen(true)}
                  className="account-phone-verify inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#163300] transition disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {profile?.phoneVerified ? <CheckCircleIcon size={18} /> : <ShieldCheckIcon size={18} />}
                  {profile?.phoneVerified ? "Verified" : "Verify"}
                </button>
                <small className="text-xs text-[#6b7168]">
                  {profile?.phoneVerified ? "This number is verified." : "Save your number, then tap verify."}
                </small>
              </div>
            </FormSection>

            {success ? <StatusMessage tone="success">{success}</StatusMessage> : null}
            {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

            <Button type="submit" loading={saving} className="account-save-changes">Save changes</Button>
          </form>
        )}

        {verifyNoticeOpen ? (
          <div className="status-message status-info" role="status">
            <div>Phone verification is coming soon. Save your number now, and you&apos;ll be able to confirm it here as soon as it&apos;s ready.</div>
            <button type="button" className="ghost-link" onClick={() => setVerifyNoticeOpen(false)}>Close</button>
          </div>
        ) : null}
      </div>
    </>
  );
}

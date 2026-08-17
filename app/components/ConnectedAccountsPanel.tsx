"use client";

import { useEffect, useState } from "react";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { UploadCloud as CloudArrowUpIcon } from "react-feather";
import { AlertCircle as WarningCircleIcon } from "react-feather";
import { LinkButton } from "./Button";
import { StatusMessage } from "./AsyncState";
import { GoogleProviderIcon, MicrosoftProviderIcon } from "./ProviderIcons";
import type { ConnectedAccountStatus } from "../../lib/integrations/types";
import { emptyConnectedAccountStatus } from "../../lib/integrations/types";

export function ConnectedAccountsPanel({ stacked, returnTo = "/app/settings" }: { stacked?: boolean; returnTo?: string } = {}) {
  const [status, setStatus] = useState<ConnectedAccountStatus>(emptyConnectedAccountStatus());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/integrations/status");
    if (!response.ok) return;
    const payload = await response.json() as { status?: ConnectedAccountStatus };
    if (payload.status) setStatus(payload.status);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      void refresh();
      const params = new URLSearchParams(window.location.search);
      const integration = params.get("integration");
      if (integration === "google-connected") setMessage("Google connected. Gmail, Calendar, and Drive are now available wherever you choose to use them.");
      if (integration === "microsoft-connected") setMessage("Microsoft connected. Outlook, Calendar, and OneDrive are now available wherever you choose to use them.");
      if (integration === "google-error" || integration === "microsoft-error") setError("We couldn’t connect that account. Reconnect and approve the requested permissions.");
      if (integration === "preview") setError("Connected accounts need a signed-in Supabase user; local preview mode cannot complete Google OAuth.");
      if (integration === "google-unconfigured" || integration === "microsoft-unconfigured") {
        setError("This connection has not been enabled by the ehllo workspace administrator yet.");
      }
    });
  }, []);

  async function disconnect(provider: "google" | "microsoft") {
    setError("");
    setMessage("");
    const response = await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
    if (!response.ok) {
      setError("We couldn’t disconnect that account.");
      return;
    }
    setMessage(`${provider === "google" ? "Google" : "Microsoft"} disconnected.`);
    await refresh();
  }

  return (
    <section className="activate-panel">
      <header>
        <span className="step-pill">Connected accounts</span>
        <h2><EnvelopeSimpleIcon size={22} /> Your connected services</h2>
        <p>Connect once per provider. You stay in control of which approved messages, meetings, and recordings use each account.</p>
      </header>

      <div className={`connected-account-grid${stacked ? " connected-account-grid--stacked" : ""}`}>
        <article className="connected-account-card">
          <div className="connected-account-content">
            <div className="connected-account-top">
              <div className="connected-provider-heading">
                <span><GoogleProviderIcon size={23} /></span>
                <div><strong>Google</strong><small>Google Workspace</small></div>
              </div>
              <div className="connected-capabilities">
                {([
                  ["Gmail", status.google.capabilities.gmail],
                  ["Calendar", status.google.capabilities.calendar],
                  ["Drive", status.google.capabilities.drive],
                ] as Array<[string, boolean]>).map(([label, enabled]) => (
                  <span className={enabled ? "enabled" : ""} key={String(label)}><CheckCircleIcon />{label}</span>
                ))}
              </div>
            </div>
            <p>{status.google.connected ? status.google.email : "Enable Gmail, Calendar, and optional Drive storage."}</p>
          </div>
          {status.google.connected ? (
            <div className="connected-account-actions">
              {!status.google.capabilities.drive ? <LinkButton href={`/api/integrations/google/connect?return_to=${returnTo}`} variant="secondary">Reconnect for Drive</LinkButton> : null}
              <button type="button" className="ghost-link" onClick={() => void disconnect("google")}>Disconnect</button>
            </div>
          ) : (
            <LinkButton href={`/api/integrations/google/connect?return_to=${returnTo}`} fullWidth disabled={!status.configured.google}>
              Connect Google
            </LinkButton>
          )}
          {!status.configured.google && !status.google.connected ? <div className="connected-account-warning"><WarningCircleIcon size={17} /><span><strong>Setup required</strong><small>Google connection isn’t configured in this environment.</small></span></div> : null}
        </article>

        <article className="connected-account-card">
          <div className="connected-account-content">
            <div className="connected-account-top">
              <div className="connected-provider-heading">
                <span><MicrosoftProviderIcon size={23} /></span>
                <div><strong>Microsoft</strong><small>Microsoft 365</small></div>
              </div>
              <div className="connected-capabilities">
                {([
                  ["Outlook", status.microsoft.capabilities.outlook],
                  ["Calendar", status.microsoft.capabilities.calendar],
                  ["OneDrive", status.microsoft.capabilities.onedrive],
                ] as Array<[string, boolean]>).map(([label, enabled]) => (
                  <span className={enabled ? "enabled" : ""} key={label}><CheckCircleIcon />{label}</span>
                ))}
              </div>
            </div>
            <p>{status.microsoft.connected ? status.microsoft.email : "Use Outlook, Calendar, and optional OneDrive recording storage."}</p>
          </div>
          {status.microsoft.connected ? (
            <div className="connected-account-actions">
              {!status.microsoft.capabilities.onedrive ? <LinkButton href={`/api/integrations/microsoft/connect?return_to=${returnTo}`} variant="secondary">Reconnect for OneDrive</LinkButton> : null}
              <button type="button" className="ghost-link" onClick={() => void disconnect("microsoft")}>Disconnect</button>
            </div>
          ) : (
            <LinkButton href={`/api/integrations/microsoft/connect?return_to=${returnTo}`} fullWidth disabled={!status.configured.microsoft}>
              Connect Microsoft
            </LinkButton>
          )}
          {!status.configured.microsoft && !status.microsoft.connected ? <div className="connected-account-warning"><WarningCircleIcon size={17} /><span><strong>Setup required</strong><small>Microsoft connection isn’t configured in this environment.</small></span></div> : null}
        </article>
      </div>

      {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <small className="connected-account-note"><CloudArrowUpIcon size={14} /> Cloud storage is optional. Recordings stay local unless you choose Google Drive, OneDrive, or three-day sharing for that encounter.</small>
    </section>
  );
}

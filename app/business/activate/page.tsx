"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp as ChartLineUpIcon } from "react-feather";
import { UploadCloud as CloudArrowUpIcon } from "react-feather";
import { Download as DownloadSimpleIcon } from "react-feather";
import { Send as PaperPlaneTiltIcon } from "react-feather";
import { BusinessShell } from "../../components/BusinessShell";
import { StatusMessage } from "../../components/AsyncState";
import { ConnectedAccountsPanel } from "../../components/ConnectedAccountsPanel";
import { TeamWorkspacePanel } from "../../components/TeamWorkspacePanel";
import { Button, LinkButton } from "../../components/Button";
import { activationMetrics, buildCrmExportBundle, buildCrmExportCsv } from "../../../lib/crm/export";
import { readContacts, type Contact } from "../../../lib/contacts";
import { readCrmSyncMap } from "../../../lib/crm/sync-state";
import { encountersForContact } from "../../../lib/person-links";
import { readEncounters } from "../../../lib/encounters";
import "../../app/product.css";
import "../../app/flow.css";

export default function ActivatePage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [hubspotConfigured, setHubspotConfigured] = useState(false);
  const [bulkState, setBulkState] = useState<"idle" | "syncing" | "done">("idle");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setContacts(readContacts());
      setHydrated(true);
    });
    void fetch("/api/crm/hubspot/status")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { configured?: boolean };
        setHubspotConfigured(Boolean(payload.configured));
      })
      .catch(() => undefined);
  }, []);

  const encounters = useMemo(() => readEncounters(), [contacts, bulkState]);
  const metrics = useMemo(() => activationMetrics(contacts, encounters), [contacts, encounters]);
  const syncedCount = useMemo(() => Object.keys(readCrmSyncMap()).length, [bulkState, hydrated]);

  function downloadBlob(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
  }

  function exportJson() {
    const bundle = buildCrmExportBundle(contacts, encounters);
    downloadBlob(`ehllo-export-${Date.now()}.json`, JSON.stringify(bundle, null, 2), "application/json");
  }

  function exportCsv() {
    downloadBlob(`ehllo-contacts-${Date.now()}.csv`, buildCrmExportCsv(contacts), "text/csv");
  }

  async function syncAllToHubSpot() {
    setBulkState("syncing");
    setBulkMessage("");
    setBulkError("");
    let synced = 0;
    let failed = 0;

    for (const contact of contacts) {
      const relatedEncounters = encountersForContact(contact);
      try {
        const response = await fetch("/api/crm/hubspot/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact, encounters: relatedEncounters }),
        });
        const payload = await response.json() as { externalId?: string; syncedAt?: string; error?: string };
        if (!response.ok || !payload.externalId || !payload.syncedAt) {
          failed += 1;
          continue;
        }
        const current = readCrmSyncMap();
        localStorage.setItem("aftermeet-crm-sync-v1", JSON.stringify({
          ...current,
          [contact.id]: {
            provider: "hubspot",
            externalId: payload.externalId,
            syncedAt: payload.syncedAt,
          },
        }));
        synced += 1;
      } catch {
        failed += 1;
      }
    }

    setBulkState("done");
    if (synced) {
      setBulkMessage(`${synced} contact${synced === 1 ? "" : "s"} synced to HubSpot${failed ? ` · ${failed} failed` : ""}.`);
    } else {
      setBulkError(failed ? "We couldn’t sync your contacts to HubSpot." : "Add contacts before syncing to HubSpot.");
    }
  }

  return (
    <BusinessShell
      active="activate"
      title="Activate data"
      subtitle="Business product: CRM sync, campaigns, and team activation. Not part of the consumer pilot."
    >
      <div className="flow-page activate-page">
        <div className="flow-heading">
          <div>
            <h1>Turn conversations into CRM records.</h1>
            <p>Business workspace: review-first HubSpot sync, campaigns, and team tools. Everyday share + capture lives under Consumer.</p>
          </div>
        </div>

        <section className="activate-metrics">
          <article><strong>{metrics.contacts}</strong><span>Contacts</span></article>
          <article><strong>{metrics.encounters}</strong><span>Captured moments</span></article>
          <article><strong>{metrics.openFollowUps}</strong><span>Open follow-ups</span></article>
          <article><strong>{metrics.completedFollowUps}</strong><span>Completed follow-ups</span></article>
          <article><strong>{syncedCount}</strong><span>Synced to HubSpot</span></article>
        </section>

        <section className="activate-panel">
          <header>
            <span className="step-pill">CRM sync</span>
            <h2>HubSpot</h2>
            <p>Creates or updates a HubSpot contact, then adds a note with private context and captured moments.</p>
          </header>
          {!hubspotConfigured ? (
            <StatusMessage tone="error">
              HubSpot is not configured yet. Add `HUBSPOT_ACCESS_TOKEN` from a HubSpot private app, then retry.
            </StatusMessage>
          ) : (
            <StatusMessage tone="success">HubSpot private app token detected. Sync is ready.</StatusMessage>
          )}
          <div className="activate-actions">
            <Button loading={bulkState === "syncing"} disabled={!contacts.length || !hubspotConfigured} onClick={() => void syncAllToHubSpot()}>
              <CloudArrowUpIcon size={18} />Sync all contacts
            </Button>
            <LinkButton variant="secondary" href="/business/contacts">Review contacts</LinkButton>
          </div>
          {bulkMessage ? <StatusMessage tone="success">{bulkMessage}</StatusMessage> : null}
          {bulkError ? <StatusMessage tone="error">{bulkError}</StatusMessage> : null}
        </section>

        <section className="activate-panel">
          <header>
            <span className="step-pill">Portable export</span>
            <h2>CRM-ready export</h2>
            <p>Use JSON for custom importers or CSV for spreadsheet and CRM bulk import flows.</p>
          </header>
          <div className="activate-actions">
            <Button variant="secondary" disabled={!contacts.length} onClick={exportJson}>
              <DownloadSimpleIcon size={18} />Download JSON bundle
            </Button>
            <Button variant="secondary" disabled={!contacts.length} onClick={exportCsv}>
              <DownloadSimpleIcon size={18} />Download CSV
            </Button>
          </div>
        </section>

        <section className="activate-panel">
          <header>
            <span className="step-pill">Campaigns</span>
            <h2><ChartLineUpIcon size={22} /> Attribution and workspace analytics</h2>
            <p>Tag conferences and outreach pushes, then review people, captures, source mix, and follow-through by campaign.</p>
          </header>
          <div className="activate-actions">
            <LinkButton href="/business/activate/campaigns"><ChartLineUpIcon size={18} />Open campaigns</LinkButton>
            <LinkButton variant="secondary" href="/business/activate/campaigns/new">Create campaign</LinkButton>
          </div>
        </section>

        <ConnectedAccountsPanel />

        <TeamWorkspacePanel />

        <section className="activate-panel">
          <header>
            <span className="step-pill">Outbound</span>
            <h2><PaperPlaneTiltIcon size={22} /> Review-first drafts</h2>
            <p>Draft email and LinkedIn follow-ups from meeting context. Approve each message before opening Gmail or LinkedIn. Nothing auto-sends.</p>
          </header>
          <div className="activate-actions">
            <LinkButton href="/business/outbound"><PaperPlaneTiltIcon size={18} />Open outbound queue</LinkButton>
            <LinkButton variant="secondary" href="/app/followups">Review Inbox</LinkButton>
          </div>
        </section>
      </div>
    </BusinessShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { BusinessShell } from "../../../components/BusinessShell";
import { LinkButton } from "../../../components/Button";
import { buildWorkspaceAnalytics, formatSourceLabel } from "../../../../lib/campaign-analytics";
import { campaignDateLabel, readCampaigns, type Campaign } from "../../../../lib/campaigns";
import { readContacts } from "../../../../lib/contacts";
import { readEncounters } from "../../../../lib/encounters";
import "../../../app/product.css";
import "../../../app/flow.css";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    queueMicrotask(() => setCampaigns(readCampaigns()));
  }, []);

  const analytics = useMemo(
    () => buildWorkspaceAnalytics(campaigns, readContacts(), readEncounters()),
    [campaigns],
  );

  return (
    <BusinessShell
      active="activate"
      title="Campaigns"
      subtitle="Tag event and outreach work, then see what converted into captures and follow-through."
      actions={
        <>
          <LinkButton size="small" variant="ghost" href="/business/activate"><ArrowLeftIcon size={16} />Activate</LinkButton>
          <LinkButton size="small" href="/business/activate/campaigns/new"><PlusIcon size={16} />New campaign</LinkButton>
        </>
      }
    >
      <div className="flow-page activate-page">
        <section className="activate-metrics">
          <article><strong>{analytics.totals.contacts}</strong><span>Total contacts</span></article>
          <article><strong>{analytics.totals.captures}</strong><span>Total captures</span></article>
          <article><strong>{analytics.totals.followThroughRate}%</strong><span>Follow-through</span></article>
          <article><strong>{campaigns.filter((campaign) => campaign.status === "active").length}</strong><span>Active campaigns</span></article>
        </section>

        {campaigns.length ? (
          <div className="campaign-list">
            {campaigns.map((campaign) => {
              const row = analytics.campaigns.find((item) => item.campaignId === campaign.id);
              return (
                <LinkButton key={campaign.id} variant="secondary" href={`/business/activate/campaigns/${campaign.id}`} className="campaign-row">
                  <div>
                    <strong>{campaign.name}</strong>
                    <small>{[campaign.location, campaignDateLabel(campaign), campaign.status].filter(Boolean).join(" · ")}</small>
                  </div>
                  <div className="campaign-row-metrics">
                    <span>{row?.contacts ?? 0} people</span>
                    <span>{row?.captures ?? 0} captures</span>
                    <span>{row?.followThroughRate ?? 0}% follow-through</span>
                  </div>
                </LinkButton>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <h2>No campaigns yet</h2>
              <p>Create one for a conference, dinner series, or partner push, then tag captures as you go.</p>
              <LinkButton href="/business/activate/campaigns/new"><PlusIcon size={17} />Create campaign</LinkButton>
            </div>
          </div>
        )}

        {analytics.unattributed.contacts || analytics.unattributed.captures ? (
          <section className="activate-panel muted">
            <header>
              <span className="step-pill">Unattributed</span>
              <h2>Outside campaigns</h2>
              <p>{analytics.unattributed.contacts} contacts and {analytics.unattributed.captures} captures are not linked to a campaign yet.</p>
            </header>
            {Object.keys(analytics.unattributed.sources).length ? (
              <div className="source-breakdown">
                {Object.entries(analytics.unattributed.sources).map(([source, count]) => (
                  <span key={source}>{formatSourceLabel(source)} · {count}</span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </BusinessShell>
  );
}

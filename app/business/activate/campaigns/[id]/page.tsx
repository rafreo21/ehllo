"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { BusinessShell } from "../../../../components/BusinessShell";
import { Button, LinkButton } from "../../../../components/Button";
import {
  buildCampaignAttribution,
  contactsForCampaign,
  encountersForCampaign,
  formatSourceLabel,
} from "../../../../../lib/campaign-analytics";
import {
  archiveCampaign,
  campaignDateLabel,
  findCampaignById,
  readActiveCampaignId,
  writeActiveCampaignId,
  type Campaign,
} from "../../../../../lib/campaigns";
import { readContacts } from "../../../../../lib/contacts";
import { readEncounters } from "../../../../../lib/encounters";
import "../../../../app/product.css";
import "../../../../app/flow.css";

export default function CampaignDetailPage() {
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [activeCampaignId, setActiveCampaignId] = useState("");

  useEffect(() => {
    const id = window.location.pathname.split("/").filter(Boolean).at(-1) || "";
    queueMicrotask(() => {
      setCampaign(findCampaignById(id));
      setActiveCampaignId(readActiveCampaignId());
    });
  }, []);

  const contacts = useMemo(() => readContacts(), [campaign]);
  const encounters = useMemo(() => readEncounters(), [campaign]);
  const attribution = useMemo(
    () => (campaign ? buildCampaignAttribution(campaign.id, contacts, encounters) : null),
    [campaign, contacts, encounters],
  );
  const campaignContacts = useMemo(
    () => (campaign ? contactsForCampaign(campaign.id, contacts) : []),
    [campaign, contacts],
  );
  const campaignEncounters = useMemo(
    () => (campaign ? encountersForCampaign(campaign.id, contacts, encounters) : []),
    [campaign, contacts, encounters],
  );

  if (campaign === undefined) return null;

  if (!campaign || !attribution) {
    return (
      <BusinessShell active="activate" title="Campaign" actions={<LinkButton size="small" variant="ghost" href="/business/activate/campaigns"><ArrowLeftIcon size={16} />Campaigns</LinkButton>}>
        <div className="empty-state"><div><h2>Campaign not found</h2><LinkButton href="/business/activate/campaigns">Back to campaigns</LinkButton></div></div>
      </BusinessShell>
    );
  }

  function setActive() {
    writeActiveCampaignId(campaign.id);
    setActiveCampaignId(campaign.id);
  }

  function archive() {
    archiveCampaign(campaign.id);
    window.location.href = "/business/activate/campaigns";
  }

  return (
    <BusinessShell
      active="activate"
      title={campaign.name}
      subtitle="Campaign attribution for people, captures, and follow-through."
      actions={<LinkButton size="small" variant="ghost" href="/business/activate/campaigns"><ArrowLeftIcon size={16} />Campaigns</LinkButton>}
    >
      <div className="flow-page activate-page">
        <section className="activate-panel">
          <header>
            <span className="step-pill">{campaign.status === "active" ? "Active campaign" : "Archived"}</span>
            <h2>{campaign.name}</h2>
            <p>{[campaign.location, campaignDateLabel(campaign), campaign.notes].filter(Boolean).join(" · ")}</p>
          </header>
          <div className="activate-actions">
            {activeCampaignId === campaign.id ? (
              <Button variant="secondary" disabled><CheckCircleIcon size={18} />Active for new captures</Button>
            ) : (
              <Button variant="secondary" onClick={setActive}>Set active for new captures</Button>
            )}
            {campaign.status === "active" ? (
              <Button variant="ghost" onClick={archive}>Archive campaign</Button>
            ) : null}
          </div>
        </section>

        <section className="activate-metrics">
          <article><strong>{attribution.contacts}</strong><span>People</span></article>
          <article><strong>{attribution.captures}</strong><span>Captures</span></article>
          <article><strong>{attribution.openFollowUps}</strong><span>Open follow-ups</span></article>
          <article><strong>{attribution.completedFollowUps}</strong><span>Completed</span></article>
          <article><strong>{attribution.followThroughRate}%</strong><span>Follow-through</span></article>
        </section>

        {Object.keys(attribution.sources).length ? (
          <section className="activate-panel">
            <header><h2>Source attribution</h2><p>How people entered this campaign.</p></header>
            <div className="source-breakdown">
              {Object.entries(attribution.sources).map(([source, count]) => (
                <span key={source}>{formatSourceLabel(source)} · {count}</span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="activate-panel">
          <header><h2>People in this campaign</h2><p>{campaignContacts.length} attributed contacts.</p></header>
          {campaignContacts.length ? (
            <div className="campaign-people-list">
              {campaignContacts.slice(0, 8).map((contact) => (
                <LinkButton key={contact.id} variant="ghost" href={`/business/contacts/${contact.id}`}>
                  {contact.firstName} {contact.lastName}
                </LinkButton>
              ))}
            </div>
          ) : (
            <p className="contact-detail-context">Tag new contacts or captures with this campaign to build attribution.</p>
          )}
        </section>

        <section className="activate-panel">
          <header><h2>Captured moments</h2><p>{campaignEncounters.length} encounters linked to this campaign.</p></header>
          {campaignEncounters.length ? (
            <div className="campaign-people-list">
              {campaignEncounters.slice(0, 8).map((encounter) => (
                <LinkButton key={encounter.id} variant="ghost" href={`/app/encounters/${encounter.id}`}>
                  {encounter.title || encounter.personName}
                </LinkButton>
              ))}
            </div>
          ) : (
            <p className="contact-detail-context">Start a capture with this campaign active to attribute the moment.</p>
          )}
        </section>
      </div>
    </BusinessShell>
  );
}

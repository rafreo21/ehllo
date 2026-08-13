"use client";

import { useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { FloppyDiskIcon } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { BusinessShell } from "../../../../components/BusinessShell";
import { Button, LinkButton } from "../../../../components/Button";
import { TextAreaField, TextField } from "../../../../components/FormField";
import { createCampaign, writeActiveCampaignId } from "../../../../../lib/campaigns";
import "../../../../app/product.css";
import "../../../../app/flow.css";

export default function NewCampaignPage() {
  const [form, setForm] = useState({
    name: "",
    location: "",
    startsAt: "",
    endsAt: "",
    notes: "",
    setActive: true,
  });
  const [error, setError] = useState("");

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Give the campaign a name.");
      return;
    }
    const campaign = createCampaign(form);
    if (form.setActive) writeActiveCampaignId(campaign.id);
    window.location.href = `/business/activate/campaigns/${campaign.id}`;
  }

  return (
    <BusinessShell
      active="activate"
      title="New campaign"
      subtitle="Use campaigns to attribute event and outreach work without turning Ehllo into a marketing automation tool."
      actions={<LinkButton size="small" variant="ghost" href="/business/activate/campaigns"><ArrowLeftIcon size={16} />Campaigns</LinkButton>}
    >
      <form className="contact-form-card" onSubmit={save}>
        <header>
          <span className="step-pill">Campaigns</span>
          <h1>Name the moment</h1>
          <p>Examples: SaaStr booth, partner dinner series, investor roadshow.</p>
        </header>
        <TextField label="Campaign name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} error={error} />
        <TextField label="Location" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="London, online, multi-city" />
        <div className="field-row two">
          <TextField label="Starts" type="date" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} />
          <TextField label="Ends" type="date" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} />
        </div>
        <TextAreaField label="Notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional context for your team." />
        <label className="checkbox-row">
          <input type="checkbox" checked={form.setActive} onChange={(event) => setForm((current) => ({ ...current, setActive: event.target.checked }))} />
          Set as active campaign for new captures
        </label>
        <div className="form-actions">
          <LinkButton variant="ghost" href="/business/activate/campaigns">Cancel</LinkButton>
          <Button type="submit"><FloppyDiskIcon size={18} weight="bold" />Create campaign</Button>
        </div>
      </form>
    </BusinessShell>
  );
}

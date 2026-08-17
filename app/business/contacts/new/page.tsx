"use client";

import { useEffect, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { Save as FloppyDiskIcon } from "react-feather";
import { BusinessShell } from "../../../components/BusinessShell";
import { ActiveCampaignField, defaultCampaignId } from "../../../components/ActiveCampaignField";
import { Button, LinkButton } from "../../../components/Button";
import { TextAreaField, TextField } from "../../../components/FormField";
import { PhoneField } from "../../../components/PhoneField";
import {
  capturedProfileFullName,
  contactDisplayName,
  findContactById,
  splitFullName,
  type Contact,
} from "../../../../lib/contacts";
import { resolveAndSaveContact } from "../../../../lib/person-links";
import { normalizeLinkedInUrl, parseLinkedInProfileInput } from "../../../../lib/linkedin-profile";
import "../../../app/product.css";
import "../../../app/flow.css";

export default function NewContactPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    company: "",
    role: "",
    context: "",
    nextAction: "",
  });
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState("");
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedin = params.get("linkedin") ?? params.get("url") ?? "";
    const contactId = params.get("contact") ?? "";
    queueMicrotask(() => {
      if (linkedin) {
        const profile = parseLinkedInProfileInput(linkedin);
        if (profile) {
          setForm((current) => ({
            ...current,
            fullName: current.fullName || capturedProfileFullName(profile),
            linkedinUrl: normalizeLinkedInUrl(profile.url),
          }));
        }
      }
      if (contactId) {
        const contact = findContactById(contactId);
        if (contact) {
          setForm({
            fullName: contactDisplayName(contact),
            email: contact.email,
            phone: contact.phone ?? "",
            linkedinUrl: contact.linkedinUrl ?? "",
            company: contact.company,
            role: contact.role,
            context: contact.context,
            nextAction: "",
          });
        }
      }
      setCampaignId(defaultCampaignId());
    });
  }, []);

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.fullName.trim()) {
      setError("Enter their full name.");
      return;
    }
    const { firstName, lastName } = splitFullName(form.fullName);
    const profile = form.linkedinUrl ? parseLinkedInProfileInput(form.linkedinUrl) : null;
    const contact: Contact = {
      id: profile ? `linkedin-${profile.handle}` : crypto.randomUUID(),
      firstName,
      lastName,
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      linkedinUrl: form.linkedinUrl.trim() ? normalizeLinkedInUrl(form.linkedinUrl.trim()) : undefined,
      company: form.company.trim(),
      role: form.role.trim(),
      context: form.context.trim(),
      source: form.linkedinUrl.trim() ? "linkedin" : "manual",
      campaignId: campaignId || undefined,
    };
    resolveAndSaveContact(contact);
    try {
      localStorage.setItem("aftermeet-last-contact-v1", JSON.stringify(contact));
    } catch {}
    window.location.href = `/business/contacts/${contact.id}`;
  }

  return (
    <BusinessShell active="contacts" title="New contact" subtitle="Capture who they are, what mattered, and what happens next." actions={<LinkButton size="small" variant="ghost" href="/business/contacts"><ArrowLeftIcon size={16} />Cancel</LinkButton>}>
      <form className="contact-form-card" onSubmit={save}>
        <header><span className="step-pill">Meeting capture</span><h1>Who did you meet?</h1><p>Keep it lightweight. Context and the next action are more valuable than completing every field.</p></header>
        <TextField label="Full name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} autoComplete="name" error={error} />
        <div className="field-row two"><TextField label="Email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /><PhoneField label="Phone" value={form.phone} onChange={(value) => update("phone", value)} /></div>
        <TextField label="LinkedIn profile" value={form.linkedinUrl} onChange={(e) => update("linkedinUrl", e.target.value)} placeholder="https://www.linkedin.com/in/username" />
        <ActiveCampaignField value={campaignId} onChange={setCampaignId} />
        <div className="field-row two"><TextField label="Role" value={form.role} onChange={(e) => update("role", e.target.value)} /><TextField label="Company" value={form.company} onChange={(e) => update("company", e.target.value)} /></div>
        <div className="context-box"><h3>Remember the meeting</h3><p>These private details never appear on your public card.</p></div>
        <TextAreaField label="What mattered?" hint="Private" value={form.context} onChange={(e) => update("context", e.target.value)} rows={4} placeholder="What did you discuss? What should you remember?" />
        <TextField label="Next action" value={form.nextAction} onChange={(e) => update("nextAction", e.target.value)} placeholder="e.g. Send the research deck on Monday" />
        <div className="form-actions"><LinkButton variant="ghost" href="/business/contacts">Cancel</LinkButton><Button type="submit"><FloppyDiskIcon size={18} />Save contact</Button></div>
      </form>
    </BusinessShell>
  );
}

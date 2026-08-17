"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { Calendar as CalendarBlankIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { Mic as MicrophoneIcon } from "react-feather";
import { Phone as PhoneIcon } from "react-feather";
import { BusinessShell } from "../../../components/BusinessShell";
import { LinkButton } from "../../../components/Button";
import { contactDisplayName, findContactById, type Contact } from "../../../../lib/contacts";
import { CrmSyncButton } from "../../../components/CrmSyncButton";
import { encountersForContact } from "../../../../lib/person-links";
import { formatDuration, type Encounter } from "../../../../lib/encounters";
import "../../../app/product.css";
import "../../../app/flow.css";

function linkedinHref(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

export default function ContactDetailPage() {
  const [contactId, setContactId] = useState("");
  const [contact, setContact] = useState<Contact | null | undefined>(undefined);
  const [encounters, setEncounters] = useState<Encounter[]>([]);

  useEffect(() => {
    const id = window.location.pathname.split("/").filter(Boolean).at(-1) || "";
    queueMicrotask(() => {
      setContactId(id);
      const loaded = findContactById(id);
      setContact(loaded);
      if (loaded) setEncounters(encountersForContact(loaded));
    });
  }, []);

  const methods = useMemo(() => {
    if (!contact) return [];
    const items: Array<{ label: string; href: string; Icon: typeof EnvelopeSimpleIcon }> = [];
    if (contact.email) items.push({ label: contact.email, href: `mailto:${contact.email}`, Icon: EnvelopeSimpleIcon });
    if (contact.phone) items.push({ label: contact.phone, href: `tel:${contact.phone.replace(/\s+/g, "")}`, Icon: PhoneIcon });
    if (contact.linkedinUrl) items.push({ label: "LinkedIn profile", href: linkedinHref(contact.linkedinUrl), Icon: LinkedinLogoIcon });
    if (contact.companyWebsite) items.push({ label: "Company website", href: linkedinHref(contact.companyWebsite), Icon: IdentificationCardIcon });
    if (contact.personalWebsite) items.push({ label: "Portfolio", href: linkedinHref(contact.personalWebsite), Icon: IdentificationCardIcon });
    return items;
  }, [contact]);

  if (contact === undefined) return null;

  if (!contact) {
    return (
      <BusinessShell active="contacts" title="Contact" actions={<LinkButton size="small" variant="ghost" href="/business/contacts"><ArrowLeftIcon size={16} />People</LinkButton>}>
        <div className="empty-state"><div><h2>Person not found</h2><p>This contact may have been removed or saved in another browser.</p><LinkButton href="/business/contacts">Back to People</LinkButton></div></div>
      </BusinessShell>
    );
  }

  const displayName = contactDisplayName(contact);

  return (
    <BusinessShell
      active="contacts"
      title={displayName}
      subtitle="One record for who they are, how to reach them, and every moment you captured."
      actions={<LinkButton size="small" variant="ghost" href="/business/contacts"><ArrowLeftIcon size={16} />People</LinkButton>}
    >
      <div className="flow-page contact-detail">
        <header className="contact-detail-head">
          <span className="contact-avatar contact-detail-avatar">{contact.firstName[0]}{contact.lastName[0] || contact.firstName[1] || ""}</span>
          <div>
            <span className="step-pill">{contact.source === "exchange" ? "Card exchange" : contact.source ? `${contact.source} import` : "Manual contact"}</span>
            <h1>{displayName}</h1>
            <p>{[contact.role, contact.company].filter(Boolean).join(" · ") || "No company listed yet"}</p>
          </div>
          <div className="contact-detail-actions">
            <LinkButton href={`/app/encounters/new?contact=${encodeURIComponent(contactId)}`}><MicrophoneIcon size={16} />Capture moment</LinkButton>
            <CrmSyncButton contact={contact} encounters={encounters} />
            <LinkButton variant="secondary" href="/app/followups">Open inbox</LinkButton>
          </div>
        </header>

        {methods.length ? (
          <section className="contact-detail-section">
            <header><h2>Reach them</h2><p>Methods synced from card exchange or what you saved.</p></header>
            <div className="contact-method-list">
              {methods.map(({ label, href, Icon }) => (
                <a key={href} className="contact-method" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>
                  <Icon size={18} />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </section>
        ) : (
          <section className="contact-detail-section contact-detail-empty">
            <header><h2>Reach them</h2><p>No email, phone, or LinkedIn yet. Link a card exchange during capture or edit this person later.</p></header>
          </section>
        )}

        {contact.context ? (
          <section className="contact-detail-section">
            <header><h2>What you remember</h2><p>Private context from imports or notes.</p></header>
            <p className="contact-detail-context">{contact.context}</p>
          </section>
        ) : null}

        {contact.exchangeId ? (
          <section className="contact-detail-section">
            <header><h2>Card exchange</h2><p>They shared their details back from your public card.</p></header>
            <div className="contact-exchange-card">
              <IdentificationCardIcon size={22} />
              <div><strong>Linked exchange</strong><small>Exchange ID {contact.exchangeId.slice(0, 8)}…</small></div>
            </div>
          </section>
        ) : null}

        <section className="contact-detail-section">
          <header><h2>Captured moments</h2><p>Encounters linked to this person during capture or review.</p></header>
          {encounters.length ? (
            <div className="contact-encounter-list">
              {encounters.map((encounter) => (
                <LinkButton key={encounter.id} variant="secondary" href={`/app/encounters/${encounter.id}`} className="contact-encounter-row">
                  <div>
                    <strong>{encounter.title || displayName}</strong>
                    <small>{formatDuration(encounter.durationSeconds)} · {encounter.status}{encounter.startedAt ? ` · ${new Date(encounter.startedAt).toLocaleDateString()}` : ""}</small>
                  </div>
                  <CalendarBlankIcon size={18} />
                </LinkButton>
              ))}
            </div>
          ) : (
            <div className="contact-detail-empty-inline">
              <p>No encounters linked yet.</p>
              <LinkButton href={`/app/encounters/new?contact=${encodeURIComponent(contactId)}`}><MicrophoneIcon size={16} />Start capture</LinkButton>
            </div>
          )}
        </section>
      </div>
    </BusinessShell>
  );
}

"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus as FileArrowUpIcon } from "react-feather";
import { Linkedin as LinkedinLogoIcon } from "react-feather";
import { Search as MagnifyingGlassIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { Users as UsersThreeIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Phone as PhoneIcon } from "react-feather";
import { BusinessShell } from "../../components/BusinessShell";
import { PageSkeleton, StatusMessage } from "../../components/AsyncState";
import { Button, LinkButton } from "../../components/Button";
import { TextField } from "../../components/FormField";
import { contactDisplayName, contactFromExchange, readContacts, type Contact } from "../../../lib/contacts";
import type { EnrichmentField, EnrichmentResult } from "../../../lib/contact-enrichment";
import { isFillableEnrichmentResult } from "../../../lib/contact-enrichment";
import { resolveAndSaveContact } from "../../../lib/person-links";
import { hydrateContactsFromServer } from "../../../lib/contacts-sync";
import "../../app/product.css";
import "../../app/flow.css";

function contactSourceLabel(source?: Contact["source"]) {
  switch (source) {
    case "exchange": return "Shared from your card";
    case "vcard": return "vCard import";
    case "badge": return "Badge scan";
    case "linkedin": return "LinkedIn";
    case "scan": return "QR scan";
    case "csv": return "CSV import";
    case "manual": return "Manual add";
    default: return "";
  }
}

type CardExchange = {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
  visitor_company: string;
  visitor_role: string;
  note: string;
  created_at: string;
  cards?: { full_name?: string; slug?: string } | { full_name?: string; slug?: string }[] | null;
};

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] || "Guest", lastName: parts.slice(1).join(" ") };
}

function cardLabel(exchange: CardExchange) {
  const card = Array.isArray(exchange.cards) ? exchange.cards[0] : exchange.cards;
  return card?.full_name || "your card";
}

function parseCsv(text: string): Contact[] {
  const rows = text.trim().split(/\r?\n/).map((row) => row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
  const headers = rows.shift()?.map((header) => header.toLowerCase()) ?? [];
  const value = (row: string[], names: string[]) => row[headers.findIndex((header) => names.includes(header))] || "";
  return rows.map((row, index) => ({
    id: `csv-${Date.now()}-${index}`,
    firstName: value(row, ["first name", "firstname", "given name"]),
    lastName: value(row, ["last name", "lastname", "family name"]),
    email: value(row, ["email", "email address", "e-mail address"]),
    company: value(row, ["company", "organization", "organisation"]),
    role: value(row, ["role", "job title", "title"]),
    context: "",
    source: "csv",
  })).filter((contact) => contact.firstName || contact.lastName || contact.email);
}

function parseVcard(text: string): Contact[] {
  return text.split(/END:VCARD/i).map((card, index) => {
    const field = (name: string) => card.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "im"))?.[1]?.trim() || "";
    const [lastName = "", firstName = ""] = field("N").split(";");
    return {
      id: `vcard-${Date.now()}-${index}`,
      firstName: firstName || field("FN").split(" ")[0] || "",
      lastName: lastName || field("FN").split(" ").slice(1).join(" "),
      email: field("EMAIL"),
      company: field("ORG").replace(/;/g, " "),
      role: field("TITLE"),
      context: "",
      source: "vcard" as const,
    };
  }).filter((contact) => contact.firstName || contact.lastName || contact.email);
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [exchanges, setExchanges] = useState<CardExchange[]>([]);
  const [exchangeError, setExchangeError] = useState("");
  const [enrichingKey, setEnrichingKey] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void hydrateContactsFromServer()
      .then((next) => setContacts(next))
      .catch(() => {
        try { setContacts(JSON.parse(localStorage.getItem("aftermeet-contacts-v1") || "[]")); }
        catch { setImportError("We couldn’t load your saved contacts. Refresh the page to try again."); }
      })
      .finally(() => { setHydrated(true); });
  }, []);
  useEffect(() => {
    void fetch("/api/cards/exchanges")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { exchanges?: CardExchange[] };
        setExchanges(payload.exchanges ?? []);
      })
      .catch(() => setExchangeError("We couldn’t load people who shared back from your card."));
  }, []);
  const visible = useMemo(() => contacts.filter((contact) => `${contact.firstName} ${contact.lastName} ${contact.company} ${contact.email}`.toLowerCase().includes(query.toLowerCase())), [contacts, query]);

  async function enrichContactField(contact: Contact, field: EnrichmentField) {
    const key = `${contact.id}:${field}`;
    setEnrichingKey(key);
    setImportMessage("");
    setImportError("");
    try {
      const response = await fetch("/api/contacts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: contactDisplayName(contact),
          company: contact.company,
          linkedinUrl: contact.linkedinUrl,
          field,
          seedWorkEmail: contact.workEmail,
          seedPersonalEmail: contact.personalEmail,
          seedEmail: contact.email,
          seedPhone: contact.phone,
        }),
      });
      const payload = await response.json() as EnrichmentResult & { error?: string };
      if (!response.ok) {
        setImportError(payload.error || `Could not find a ${field}.`);
        return;
      }
      if (!isFillableEnrichmentResult(payload)) {
        setImportMessage(`No verified ${field} found for ${contactDisplayName(contact)}.`);
        return;
      }
      resolveAndSaveContact({
        ...contact,
        email: field === "email" ? payload.value : contact.email,
        workEmail: field === "email" ? payload.value : contact.workEmail,
        phone: field === "phone" ? payload.value : contact.phone,
      });
      setContacts(readContacts());
      setImportMessage(`${field === "email" ? "Email" : "Phone"} updated for ${contactDisplayName(contact)}.`);
    } catch {
      setImportError(`Could not search for a ${field}.`);
    } finally {
      setEnrichingKey("");
    }
  }

  async function importExchange(exchange: CardExchange) {
    resolveAndSaveContact(contactFromExchange(exchange, cardLabel(exchange)));
    setContacts(readContacts());
    const response = await fetch("/api/cards/exchanges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: exchange.id, status: "imported" }),
    });
    if (response.ok) {
      setExchanges((current) => current.filter((item) => item.id !== exchange.id));
      setImportMessage(`${exchange.visitor_name} added from your public card.`);
    }
  }

  async function dismissExchange(id: string) {
    const response = await fetch("/api/cards/exchanges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "dismissed" }),
    });
    if (response.ok) setExchanges((current) => current.filter((item) => item.id !== id));
  }

  async function importContacts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage("");
    setImportError("");
    try {
      const text = await file.text();
      const imported = file.name.toLowerCase().endsWith(".vcf") ? parseVcard(text) : parseCsv(text);
      if (!imported.length) {
        setImportError("No contacts were found. Check that the file is a valid CSV or vCard and try again.");
        return;
      }
      const existingKeys = new Set(contacts.map((contact) => `${contact.email.toLowerCase()}|${contact.firstName.toLowerCase()}|${contact.lastName.toLowerCase()}`));
      const unique = imported.filter((contact) => !existingKeys.has(`${contact.email.toLowerCase()}|${contact.firstName.toLowerCase()}|${contact.lastName.toLowerCase()}`));
      for (const contact of unique) resolveAndSaveContact(contact);
      setContacts(readContacts());
      setImportMessage(`${unique.length} contact${unique.length === 1 ? "" : "s"} imported${unique.length < imported.length ? ` · ${imported.length - unique.length} duplicate${imported.length - unique.length === 1 ? "" : "s"} skipped` : ""}.`);
    } catch {
      setImportError("We couldn’t read that file. Try exporting it again as CSV or vCard.");
    } finally {
      event.target.value = "";
      setImporting(false);
    }
  }

  const importButton = <Button variant="secondary" loading={importing} onClick={() => importInput.current?.click()}><FileArrowUpIcon size={17} />{importing ? "Importing…" : "Import contacts"}</Button>;
  const captureButtons = <>
    <LinkButton variant="secondary" href="/app/scan"><QrCodeIcon size={17} weight="bold" />Scan badge</LinkButton>
    <LinkButton variant="secondary" href="/business/contacts/linkedin"><LinkedinLogoIcon size={17} />LinkedIn</LinkButton>
  </>;

  return (
    <BusinessShell active="contacts" title="Contacts CRM" subtitle="Business directory: imports, manual CRM records, and HubSpot-ready contact detail." actions={<LinkButton size="small" variant="ghost" href="/business/activate">Activate data</LinkButton>}>
      <div className="flow-page">
        <input ref={importInput} className="sr-only" type="file" accept=".csv,.vcf,text/csv,text/vcard" onChange={importContacts} />
        <div className="flow-heading"><div><h1>Business contact directory.</h1><p>CRM-style records and imports. For everyday exchanges, use Consumer → Connections.</p></div></div>
        {importMessage && <StatusMessage tone="success">{importMessage}</StatusMessage>}
        {importError && <StatusMessage tone="error" action={<Button size="small" variant="ghost" onClick={() => setImportError("")}>Dismiss</Button>}>{importError}</StatusMessage>}
        {exchangeError && <StatusMessage tone="error">{exchangeError}</StatusMessage>}
        {hydrated && exchanges.length ? (
          <section className="inbound-captures">
            <div className="inbound-captures-head">
              <h2>Shared back from your card</h2>
              <p>{exchanges.length} new {exchanges.length === 1 ? "person" : "people"} sent their details from a public card.</p>
            </div>
            <div className="inbound-capture-list">
              {exchanges.map((exchange) => (
                <article className="inbound-capture-row" key={exchange.id}>
                  <div>
                    <h3>{exchange.visitor_name}</h3>
                    <p>{[exchange.visitor_role, exchange.visitor_company].filter(Boolean).join(" · ") || exchange.visitor_email || "No company listed"}</p>
                    {exchange.note ? <small>{exchange.note}</small> : null}
                    <small className="contact-source">From {cardLabel(exchange)}</small>
                  </div>
                  <div className="inbound-capture-actions">
                    <Button size="small" onClick={() => void importExchange(exchange)}>Add contact</Button>
                    <Button size="small" variant="ghost" onClick={() => void dismissExchange(exchange.id)}>Dismiss</Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {!hydrated ? <PageSkeleton rows={3} /> : contacts.length ? <>
          <div className="contact-toolbar">
            <div className="contact-search">
              <TextField label="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} leadingIcon={<MagnifyingGlassIcon size={18} />} />
            </div>
            <div className="contact-toolbar-actions">{captureButtons}{importButton}<LinkButton href="/business/contacts/new"><PlusIcon size={17} />Add person</LinkButton></div>
          </div>
          {visible.length ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {visible.map((contact) => (
                <li
                  key={contact.id}
                  className="rounded-xl border border-[#d5d9d3] bg-white p-4 shadow-[0_10px_30px_rgba(22,51,0,0.05)] sm:p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="contact-avatar shrink-0">{contact.firstName[0]}{contact.lastName[0]}</span>
                      <div className="min-w-0">
                        <p className="m-0 truncate text-base font-bold text-[#163300]">
                          {contact.firstName} {contact.lastName}
                        </p>
                        <p className="m-0 truncate text-xs text-[#60675d]">
                          {contact.role || contactSourceLabel(contact.source) || "Contact"}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-center xl:gap-4 xl:flex-1 xl:max-w-3xl">
                      <div className="min-w-0">
                        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#98a39a]">Company</p>
                        <p className="m-0 mt-1 truncate text-sm font-semibold text-[#163300]">{contact.company || "N/A"}</p>
                        {contact.source ? (
                          <p className="m-0 mt-0.5 truncate text-xs text-[#60675d]">{contactSourceLabel(contact.source)}</p>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#98a39a]">Email</p>
                        <div className="mt-1">
                          {contact.email ? (
                            <p className="m-0 truncate text-sm text-[#163300]">{contact.email}</p>
                          ) : (
                            <Button
                              size="small"
                              variant="secondary"
                              loading={enrichingKey === `${contact.id}:email`}
                              onClick={() => void enrichContactField(contact, "email")}
                            >
                              <EnvelopeSimpleIcon size={15} />Find email
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#98a39a]">Mobile</p>
                        <div className="mt-1">
                          {contact.phone ? (
                            <p className="m-0 truncate text-sm text-[#163300]">{contact.phone}</p>
                          ) : (
                            <Button
                              size="small"
                              variant="secondary"
                              loading={enrichingKey === `${contact.id}:phone`}
                              onClick={() => void enrichContactField(contact, "phone")}
                            >
                              <PhoneIcon size={15} />Find mobile
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <LinkButton size="small" variant="secondary" href={`/business/contacts/${contact.id}`}>Open</LinkButton>
                      <LinkButton size="small" variant="ghost" href="/app/followups">Follow-up</LinkButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state"><div><h2>No matching people</h2><p>Try a different name or company.</p><Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button></div></div>
          )}
        </> : <div className="empty-state"><div><span className="empty-icon"><UsersThreeIcon size={32} /></span><h2>No contacts yet</h2><p>Add someone you’ve met, scan a badge, import a file, or publish a card so people can share their details back.</p><div className="empty-state-actions"><LinkButton href="/business/contacts/new"><PlusIcon size={17} />Add person</LinkButton><LinkButton href="/app/scan"><QrCodeIcon size={17} weight="bold" />Scan badge</LinkButton><LinkButton href="/business/contacts/linkedin"><LinkedinLogoIcon size={17} />LinkedIn</LinkButton>{importButton}</div></div></div>}
      </div>
    </BusinessShell>
  );
}

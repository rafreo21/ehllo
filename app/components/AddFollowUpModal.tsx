"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Calendar as CalendarBlankIcon } from "react-feather";
import { ChevronDown as CaretDownIcon } from "react-feather";
import { ChevronRight as CaretRightIcon } from "react-feather";
import { ChevronUp as CaretUpIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Search as MagnifyingGlassIcon } from "react-feather";
import { Send as PaperPlaneTiltIcon } from "react-feather";
import { Edit2 as PencilSimpleLineIcon } from "react-feather";
import { Edit2 as PencilSimpleIcon } from "react-feather";
import { Plus as PlusIcon } from "react-feather";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { ScanIcon } from "@phosphor-icons/react/dist/csr/Scan";
import { X as XIcon } from "react-feather";
import QRCode from "qrcode";
import { StatusMessage } from "./AsyncState";
import { Button } from "./Button";
import { SelectField, TextField } from "./FormField";
import { getActiveCardId, readCardLibrary } from "../../lib/card-library";
import { fetchAllConnectionsMerged, filterConnections, type ConnectionItem } from "../../lib/connections";
import { encounterToApiBody, writeEncounter, type Encounter } from "../../lib/encounters";
import { displayFollowUpTitle, SELECTABLE_FOLLOW_UP_CHANNELS, type FollowUpChannel } from "../../lib/follow-up-channels";
import { followUpDueDate } from "../../lib/follow-up-templates";

type InboundExchange = {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
  status?: string;
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type AddFollowUpPrefill = {
  personName?: string;
  personEmail?: string;
  sourceId?: string;
  contactId?: string;
  exchangeId?: string;
};

export function AddFollowUpModal({
  open,
  onClose,
  prefill,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: AddFollowUpPrefill;
  onCreated?: () => void;
}) {
  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [contactId, setContactId] = useState("");
  const [exchangeId, setExchangeId] = useState("");
  const [owner, setOwner] = useState<Encounter["actions"][number]["owner"]>("me");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<FollowUpChannel>("email");
  const [dueAt, setDueAt] = useState(followUpDueDate(1));
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const [qrCardName, setQrCardName] = useState("");
  const [scansOpen, setScansOpen] = useState(false);
  const [exchanges, setExchanges] = useState<InboundExchange[]>([]);
  const [loadingExchanges, setLoadingExchanges] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPersonName(prefill?.personName ?? "");
    setPersonEmail(prefill?.personEmail ?? "");
    setSourceId(prefill?.sourceId ?? "");
    setContactId(prefill?.contactId ?? "");
    setExchangeId(prefill?.exchangeId ?? "");
    setOwner("me");
    setTitle("");
    setChannel("email");
    setDueAt(followUpDueDate(1));
    setDetailOpen(false);
    setError("");
    setAddPersonOpen(false);
    setPersonQuery("");
    setManualOpen(false);
    setQrOpen(false);
    setScansOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!addPersonOpen) return;
    void fetchAllConnectionsMerged().then(setConnections).catch(() => setConnections([]));
  }, [addPersonOpen]);

  useEffect(() => {
    if (!qrOpen) return;
    void Promise.resolve().then(() => {
      const cards = readCardLibrary(window.localStorage);
      const activeId = getActiveCardId(window.localStorage, cards);
      const card = cards.find((item) => item.id === activeId) || cards[0];
      if (!card?.slug) return;
      setQrCardName(card.label || card.name || "My card");
      const shareUrl = `${window.location.origin}/c/${card.slug}`;
      void QRCode.toString(shareUrl, { type: "svg", margin: 1, width: 220 })
        .then(setQrSvg)
        .catch(() => setQrSvg(""));
    });
  }, [qrOpen]);

  if (!open) return null;

  const searchResults = personQuery.trim() ? filterConnections(connections, personQuery) : [];

  function pickConnection(connection: ConnectionItem) {
    setPersonName(connection.name);
    setPersonEmail(connection.email || "");
    setSourceId(connection.sourceId || "");
    setContactId(connection.source === "contact" ? connection.sourceId : "");
    setExchangeId(connection.source === "inbound" ? connection.sourceId : "");
    setAddPersonOpen(false);
    setPersonQuery("");
  }

  function saveManualPerson() {
    const cleanName = manualName.trim();
    if (cleanName.length < 2) {
      setError("Enter a name.");
      return;
    }
    setPersonName(cleanName);
    setPersonEmail(manualEmail.trim());
    setSourceId("");
    setContactId("");
    setExchangeId("");
    setError("");
    setManualOpen(false);
    setAddPersonOpen(false);
  }

  async function openScans() {
    setScansOpen(true);
    if (exchanges.length) return;
    setLoadingExchanges(true);
    try {
      const response = await fetch("/api/cards/exchanges", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { exchanges?: InboundExchange[] };
      setExchanges((payload.exchanges || []).filter((exchange) => exchange.status !== "dismissed"));
    } catch {
      setExchanges([]);
    } finally {
      setLoadingExchanges(false);
    }
  }

  function pickExchange(exchange: InboundExchange) {
    setPersonName(exchange.visitor_name || "Unknown visitor");
    setPersonEmail(exchange.visitor_email || "");
    setSourceId("");
    setContactId("");
    setExchangeId(exchange.id);
    setScansOpen(false);
    setAddPersonOpen(false);
  }

  const pronoun = owner === "me" ? "you" : "they";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = personName.trim();
    if (cleanName.length < 2) {
      setError("Add the person this follow-up is for.");
      return;
    }
    const cleanTitle = displayFollowUpTitle(title, channel);

    setSaving(true);
    setError("");
    const now = new Date().toISOString();
    const participantId = sourceId || createId();
    const encounter: Encounter = {
      id: createId(),
      title: `Follow-up with ${cleanName}`,
      personName: cleanName,
      personEmail: personEmail.trim(),
      contactId: contactId || undefined,
      exchangeId: exchangeId || undefined,
      startedAt: now,
      endedAt: now,
      durationSeconds: 0,
      consent: {
        confirmed: false,
        method: "verbal",
        confirmedAt: now,
        scriptVersion: "2026-07-26",
      },
      transcript: "",
      privateNotes: "",
      sharedSummary: "",
      actions: [{
        id: createId(),
        title: cleanTitle,
        channel,
        owner,
        dueAt,
        status: "open",
        assigneeName: cleanName,
        assigneeEmail: personEmail.trim(),
        participantId,
      }],
      participants: [{
        id: participantId,
        name: cleanName,
        email: personEmail.trim(),
        phone: "",
        linkedIn: "",
        exchangeId: exchangeId || undefined,
      }],
      status: "reviewed",
      shareToken: createId().replace(/-/g, ""),
    };

    writeEncounter(encounter);
    try {
      const response = await fetch("/api/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encounterToApiBody(encounter)),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Could not sync this follow-up.");
      }
      setSaving(false);
      onCreated?.();
      onClose();
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "Could not sync this follow-up."} It is saved on this browser and can be retried later.`);
      setSaving(false);
    }
  }

  return (
    <>
      <div className="followup-drawer-backdrop" role="presentation" onClick={onClose}>
        <div className="followup-drawer" role="dialog" aria-label="Add follow-up" onClick={(event) => event.stopPropagation()}>
          <div className="followup-drawer-header">
            <div>
              <h2>What needs to happen next?</h2>
              <p>It will appear in Follow-ups, notifications, history, and this person&rsquo;s timeline.</p>
            </div>
            <div className="followup-drawer-header-actions">
              <button type="button" aria-label="Close" onClick={onClose}><XIcon size={18} /></button>
            </div>
          </div>

          <div className="followup-drawer-body">
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

          <form className="contact-form-card quick-follow-up-form" onSubmit={save}>
            <button
              type="button"
              onClick={() => setAddPersonOpen(true)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-[12px] border border-[#e5e9e2] bg-[#fbfdf9] px-5 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <small className="block text-[11px] font-extrabold uppercase tracking-wide text-[#8391a5]">Person</small>
                {personName.trim() ? (
                  <>
                    <strong className="block text-base text-[#163300]">{personName}</strong>
                    {personEmail.trim() ? <span className="block text-xs text-[#6b7168]">{personEmail}</span> : null}
                  </>
                ) : (
                  <span className="block text-sm text-[#6b7168]">Who is this follow-up for?</span>
                )}
              </span>
              {personName.trim() ? <PencilSimpleIcon size={18} /> : <PlusIcon size={18} />}
            </button>

            <div className="quick-follow-up-owner">
              <small className="block text-[11px] font-extrabold uppercase tracking-wide text-[#8391a5]">Owner</small>
              <div className="flow-heading-actions" style={{ marginTop: 8 }}>
                <Button type="button" variant={owner === "me" ? "primary" : "secondary"} size="small" onClick={() => setOwner("me")}>You</Button>
                <Button type="button" variant={owner === "guest" ? "primary" : "secondary"} size="small" onClick={() => setOwner("guest")}>{personName.trim() || "Them"}</Button>
              </div>
            </div>

            <div className="quick-follow-up-meta">
              <SelectField compact label={`How will ${pronoun} follow up?`} value={channel} onChange={(event) => setChannel(event.target.value as FollowUpChannel)}>
                {SELECTABLE_FOLLOW_UP_CHANNELS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
              </SelectField>
              <TextField compact label="Due date" type="date" leadingIcon={<CalendarBlankIcon size={14} />} value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </div>

            <div className="quick-follow-up-detail">
              <button
                type="button"
                aria-expanded={detailOpen}
                onClick={() => setDetailOpen((value) => !value)}
                className="quick-follow-up-detail-toggle"
              >
                <small className="block text-[11px] font-extrabold uppercase tracking-wide text-[#8391a5]">What do {pronoun} need to do? (optional)</small>
                {detailOpen ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
              </button>
              {detailOpen ? (
                <TextField
                  compact
                  label="Next step"
                  hint="Shown in your reminders so you know what this one's about."
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Send Sarah the revised product draft"
                />
              ) : null}
            </div>

            <div className="quick-follow-up-actions">
              <Button type="button" size="small" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="small" loading={saving}><CheckCircleIcon size={16} />Add follow-up</Button>
            </div>
          </form>

          <p className="quick-follow-up-note"><PaperPlaneTiltIcon size={16} />Nothing is sent automatically. ehllo reminds you until you complete it.</p>
          </div>
        </div>
      </div>

      {addPersonOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => { setAddPersonOpen(false); setPersonQuery(""); }}>
          <div className="connections-modal" role="dialog" aria-label="Add someone" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Add someone</h2>
              <button type="button" aria-label="Close" onClick={() => { setAddPersonOpen(false); setPersonQuery(""); }}><XIcon size={18} /></button>
            </header>
            <label className="connections-search">
              <MagnifyingGlassIcon size={18} />
              <input value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} placeholder="Search your connections" />
            </label>

            {personQuery.trim() ? (
              searchResults.length ? (
                <div className="grid gap-2" style={{ marginTop: 12 }}>
                  {searchResults.map((connection) => (
                    <button
                      key={connection.id}
                      type="button"
                      onClick={() => pickConnection(connection)}
                      className="flex items-center justify-between gap-4 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-4 py-3 text-left"
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-sm text-[#163300]">{connection.name}</strong>
                        <small className="block truncate text-xs text-[#6b7168]">{connection.email || connection.subtitle}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: 12 }}>No connections match &ldquo;{personQuery.trim()}&rdquo;.</p>
              )
            ) : (
              <div className="connections-add-options" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  className="flex min-h-[64px] items-center gap-3 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-4 py-3 text-left"
                >
                  <PencilSimpleLineIcon size={20} />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-[#163300]">Add manually</strong>
                    <small className="block text-xs text-[#6b7168]">Enter their name and contact details</small>
                  </span>
                  <CaretRightIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className="flex min-h-[64px] items-center gap-3 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-4 py-3 text-left"
                >
                  <QrCodeIcon size={20} weight="bold" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-[#163300]">Share QR code</strong>
                    <small className="block text-xs text-[#6b7168]">Let them scan your card and return their details</small>
                  </span>
                  <CaretRightIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void openScans()}
                  className="flex min-h-[64px] items-center gap-3 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-4 py-3 text-left"
                >
                  <ScanIcon size={20} weight="bold" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-[#163300]">Recent scans</strong>
                    <small className="block text-xs text-[#6b7168]">Choose someone who recently scanned your card</small>
                  </span>
                  <CaretRightIcon size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => setManualOpen(false)}>
          <div className="connections-modal" role="dialog" aria-label="Add manually" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Add manually</h2>
              <button type="button" aria-label="Close" onClick={() => setManualOpen(false)}><XIcon size={18} /></button>
            </header>
            <form
              className="connections-manual-form"
              onSubmit={(event) => { event.preventDefault(); saveManualPerson(); }}
            >
              <TextField label="Full name" value={manualName} onChange={(event) => setManualName(event.target.value)} required />
              <TextField label="Email" type="email" hint="Optional" value={manualEmail} onChange={(event) => setManualEmail(event.target.value)} />
              <div className="form-actions">
                <Button type="button" variant="ghost" onClick={() => setManualOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!manualName.trim()}>Add person</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {qrOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => setQrOpen(false)}>
          <div className="connections-modal connections-modal-compact" role="dialog" aria-label="Share your card" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Share your card</h2>
              <button type="button" aria-label="Close" onClick={() => setQrOpen(false)}><XIcon size={18} /></button>
            </header>
            <p>They scan this code and their details link here automatically.</p>
            <div style={{ display: "grid", justifyItems: "center", gap: 12, marginTop: 12 }}>
              {qrSvg ? (
                <div style={{ width: 220, height: 220 }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
              ) : (
                <p>Create a card first to share it here.</p>
              )}
              {qrCardName ? <strong>{qrCardName}</strong> : null}
            </div>
          </div>
        </div>
      ) : null}

      {scansOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => setScansOpen(false)}>
          <div className="connections-modal" role="dialog" aria-label="Recent scans" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Recent scans</h2>
              <button type="button" aria-label="Close" onClick={() => setScansOpen(false)}><XIcon size={18} /></button>
            </header>
            {loadingExchanges ? (
              <p>Checking for new scans…</p>
            ) : exchanges.length ? (
              <div className="grid gap-2" style={{ marginTop: 12 }}>
                {exchanges.map((exchange) => (
                  <button
                    key={exchange.id}
                    type="button"
                    onClick={() => pickExchange(exchange)}
                    className="flex items-center justify-between gap-4 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-sm text-[#163300]">{exchange.visitor_name || "Unknown visitor"}</strong>
                      <small className="block truncate text-xs text-[#6b7168]">{[exchange.visitor_email, exchange.visitor_phone].filter(Boolean).join(" · ") || "No contact yet"}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ marginTop: 12 }}>No recent scans yet. Share your QR and new submissions appear here.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

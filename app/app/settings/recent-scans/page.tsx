"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { ScanIcon } from "@phosphor-icons/react/dist/csr/Scan";
import { Trash2 as TrashIcon } from "react-feather";
import { useAppShellChrome } from "../../../components/AppShellChromeContext";
import { Button } from "../../../components/Button";
import { PageSkeleton, StatusMessage } from "../../../components/AsyncState";
import { normalizeEmailForMatching, normalizePhoneForMatching } from "../../../../lib/contact-identity";

type InboundExchange = {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
  visitor_company: string;
  visitor_role: string;
  status?: string;
  created_at?: string;
};

type ContactRow = { email?: string; phone?: string; exchangeId?: string };

type ScanGroup = {
  key: string;
  latest: InboundExchange;
  scans: InboundExchange[];
};

function scanIdentityKey(exchange: InboundExchange) {
  const email = normalizeEmailForMatching(exchange.visitor_email);
  if (email) return `email:${email}`;
  const phone = normalizePhoneForMatching(exchange.visitor_phone);
  if (phone) return `phone:${phone}`;
  const name = exchange.visitor_name?.trim().toLowerCase();
  if (name) return `name:${name}`;
  return `id:${exchange.id}`;
}

function groupScans(exchanges: InboundExchange[]): ScanGroup[] {
  const groups = new Map<string, InboundExchange[]>();
  for (const exchange of exchanges) {
    const key = scanIdentityKey(exchange);
    const list = groups.get(key) ?? [];
    list.push(exchange);
    groups.set(key, list);
  }
  return Array.from(groups.values())
    .map((scans) => {
      const sorted = [...scans].sort((left, right) => (right.created_at || "").localeCompare(left.created_at || ""));
      return { key: sorted[0].id, latest: sorted[0], scans: sorted };
    })
    .sort((left, right) => (right.latest.created_at || "").localeCompare(left.latest.created_at || ""));
}

function alreadyInDirectory(exchange: InboundExchange, contacts: ContactRow[]) {
  const email = normalizeEmailForMatching(exchange.visitor_email);
  const phone = normalizePhoneForMatching(exchange.visitor_phone);
  return contacts.some((contact) => (
    (email && normalizeEmailForMatching(contact.email) === email)
    || (phone && normalizePhoneForMatching(contact.phone) === phone)
    || contact.exchangeId === exchange.id
  ));
}

function formatScanMeta(exchange: InboundExchange) {
  return [exchange.visitor_email, exchange.visitor_phone].filter(Boolean).join(" · ")
    || exchange.visitor_company
    || "No contact details shared";
}

function formatDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function patchExchange(id: string, status: "imported" | "dismissed") {
  const response = await fetch("/api/cards/exchanges", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not update this scan.");
  }
}

export default function RecentScansPage() {
  const [exchanges, setExchanges] = useState<InboundExchange[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [exchangesRes, contactsRes] = await Promise.all([
        fetch("/api/cards/exchanges", { cache: "no-store" }),
        fetch("/api/contacts", { cache: "no-store" }),
      ]);
      const exchangesPayload = await exchangesRes.json().catch(() => ({})) as { exchanges?: InboundExchange[]; error?: string };
      if (!exchangesRes.ok) throw new Error(exchangesPayload.error || "Could not load your scans.");
      const contactsPayload = await contactsRes.json().catch(() => ({})) as { contacts?: ContactRow[] };
      setExchanges(exchangesPayload.exchanges ?? []);
      setContacts(contactsPayload.contacts ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your scans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const notImported = exchanges.filter((exchange) => exchange.status !== "imported");
  const groups = groupScans(notImported);

  async function addGroup(group: ScanGroup) {
    setBusyKey(group.key);
    setError("");
    const exchange = group.latest;
    try {
      const [firstName, ...rest] = (exchange.visitor_name || "Unknown visitor").trim().split(/\s+/);
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `exchange-${exchange.id}`,
          firstName: firstName || "Contact",
          lastName: rest.join(" "),
          email: exchange.visitor_email || "",
          phone: exchange.visitor_phone || "",
          company: exchange.visitor_company || "",
          role: exchange.visitor_role || "",
          context: "",
          source: "exchange",
          exchangeId: exchange.id,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save this person to your directory.");
      await patchExchange(exchange.id, "imported");
      const duplicates = group.scans.filter((item) => item.id !== exchange.id);
      await Promise.all(duplicates.map((item) => patchExchange(item.id, "dismissed").catch(() => {})));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this person to your directory.");
    } finally {
      setBusyKey("");
    }
  }

  async function dismissGroup(group: ScanGroup) {
    setBusyKey(group.key);
    setError("");
    try {
      await Promise.all(group.scans.map((item) => patchExchange(item.id, "dismissed")));
      setExchanges((current) => current.filter((item) => !group.scans.some((scan) => scan.id === item.id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this scan.");
    } finally {
      setBusyKey("");
    }
  }

  useAppShellChrome({ backHref: "/app/settings", backLabel: "Settings" });
  return (
    <>
      <div className="flow-page settings-page">
        <header className="flow-heading">
          <div><h1>Recent scans</h1><p>Everyone who scanned your card. Already-saved people are marked.</p></div>
        </header>

        {loading ? <PageSkeleton rows={3} /> : null}
        {error ? <StatusMessage tone="error" action={<button type="button" className="ghost-link" onClick={() => void load()}>Retry</button>}>{error}</StatusMessage> : null}

        {!loading && !groups.length && !error ? (
          <StatusMessage tone="info">Every scan has been saved, or you haven&apos;t had one yet.</StatusMessage>
        ) : null}

        {groups.length ? (
          <div className="grid gap-3">
            {groups.map((group) => {
              const repeated = group.scans.length > 1;
              const saved = alreadyInDirectory(group.latest, contacts);
              const busy = busyKey === group.key;
              return (
                <article
                  key={group.key}
                  className="flex items-center justify-between gap-4 rounded-[10px] border border-[#e5e9e2] bg-[#fbfdf9] px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="truncate">{group.latest.visitor_name || "Unknown visitor"}</strong>
                      {saved ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e2f6d5] px-2 py-0.5 text-[10px] font-bold text-[#163300]">
                          <CheckCircleIcon size={11} /> Saved
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-[#60675d]">{formatScanMeta(group.latest)}</p>
                    <small className="text-xs text-[#858b82]">
                      {repeated
                        ? `Scanned ${group.scans.length} times · Last ${formatDateTime(group.latest.created_at) || "recently"}`
                        : formatDateTime(group.latest.created_at)}
                    </small>
                  </div>
                  {busy ? (
                    <span className="button-spinner" aria-hidden="true" />
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      {!saved ? (
                        <Button size="small" onClick={() => void addGroup(group)}>
                          <CheckCircleIcon size={15} /> Add
                        </Button>
                      ) : null}
                      <Button size="small" variant="ghost" onClick={() => void dismissGroup(group)}>
                        <TrashIcon size={15} /> Dismiss
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && !groups.length && !error ? (
          <div className="connected-account-note flex items-center gap-2 text-xs text-[#6b7168]">
            <ScanIcon size={14} weight="bold" /> Share your card to start collecting scans.
          </div>
        ) : null}
      </div>
    </>
  );
}

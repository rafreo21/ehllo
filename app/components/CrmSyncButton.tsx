"use client";

import { useState } from "react";
import { UploadCloud as CloudArrowUpIcon } from "react-feather";
import { StatusMessage } from "./AsyncState";
import { Button } from "./Button";
import type { Contact } from "../../lib/contacts";
import { crmSyncRecordForContact, writeCrmSyncRecord } from "../../lib/crm/sync-state";
import type { Encounter } from "../../lib/encounters";

type CrmSyncButtonProps = {
  contact: Contact;
  encounters: Encounter[];
  size?: "small" | "medium";
  variant?: "primary" | "secondary" | "ghost";
  onSynced?: (externalId: string) => void;
};

export function CrmSyncButton({
  contact,
  encounters,
  size = "small",
  variant = "secondary",
  onSynced,
}: CrmSyncButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const existing = crmSyncRecordForContact(contact.id);

  async function syncToHubSpot() {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/crm/hubspot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, encounters }),
      });
      const payload = await response.json() as {
        configured?: boolean;
        externalId?: string;
        syncedAt?: string;
        error?: string;
      };
      if (!response.ok) {
        if (payload.configured === false) {
          setError(payload.error || "HubSpot is not configured yet.");
        } else {
          setError(payload.error || "We couldn’t sync this contact to HubSpot.");
        }
        return;
      }
      if (payload.externalId && payload.syncedAt) {
        writeCrmSyncRecord(contact.id, {
          provider: "hubspot",
          externalId: payload.externalId,
          syncedAt: payload.syncedAt,
        });
        onSynced?.(payload.externalId);
      }
      setMessage("Synced to HubSpot with meeting notes.");
    } catch {
      setError("We couldn’t reach HubSpot. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="crm-sync-control">
      <Button size={size} variant={variant} loading={loading} onClick={() => void syncToHubSpot()}>
        <CloudArrowUpIcon size={16} />
        {existing ? "Re-sync to HubSpot" : "Sync to HubSpot"}
      </Button>
      {existing ? <small className="contact-source">Last synced {new Date(existing.syncedAt).toLocaleString()}</small> : null}
      {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </div>
  );
}

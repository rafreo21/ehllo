"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { MagicWandIcon } from "@phosphor-icons/react/dist/csr/MagicWand";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { XCircleIcon } from "@phosphor-icons/react/dist/csr/XCircle";
import type { ActionLinkContext } from "../../lib/action-links";
import { resolveActionLink } from "../../lib/action-links";
import type { Contact } from "../../lib/contacts";
import type { Encounter, EncounterAction, OutboundDraft } from "../../lib/encounters";
import { composeLinksForDraft } from "../../lib/outbound-draft";
import { recordApprovedDraft, recordSentDraft, supportsOutboundDraft } from "../../lib/outbound-habit";
import { emptyConnectedAccountStatus, type ConnectedAccountStatus } from "../../lib/integrations/types";
import { Button, LinkButton } from "./Button";
import { TextAreaField, TextField } from "./FormField";

type OutboundDraftPanelProps = {
  encounter: Encounter;
  action: EncounterAction;
  context: ActionLinkContext;
  contact?: Contact | null;
  onActionChange: (next: EncounterAction) => void;
  compact?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

export function OutboundDraftPanel({
  encounter,
  action,
  context,
  contact = null,
  onActionChange,
  compact = false,
}: OutboundDraftPanelProps) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<"" | "google" | "microsoft">("");
  const [message, setMessage] = useState("");
  const [integrations, setIntegrations] = useState<ConnectedAccountStatus>(emptyConnectedAccountStatus());
  const draft = action.outboundDraft;

  useEffect(() => {
    void fetch("/api/integrations/status")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { status?: ConnectedAccountStatus };
        if (payload.status) setIntegrations(payload.status);
      })
      .catch(() => undefined);
  }, []);

  // A proposed action is still awaiting review confirmation and must not be
  // externally sendable — outbound drafting stays locked until then.
  if (
    action.owner !== "me"
    || action.status === "completed"
    || action.status === "proposed"
    || !supportsOutboundDraft(action.channel)
  ) {
    return null;
  }

  async function generateDraft() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/encounters/outbound-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encounter, action, contact }),
      });
      const payload = await response.json() as {
        draft?: { subject: string; body: string };
        source?: OutboundDraft["source"];
        generatedAt?: string;
        fallback?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        setMessage(payload.error || "We couldn’t draft this message.");
        return;
      }
      onActionChange({
        ...action,
        outboundDraft: {
          subject: payload.draft.subject,
          body: payload.draft.body,
          status: "proposed",
          source: payload.source || "heuristic",
          generatedAt: payload.generatedAt || nowIso(),
        },
      });
      setMessage(payload.fallback ? "Draft ready (template fallback)." : "Draft ready for your review.");
    } catch {
      setMessage("We couldn’t draft this message.");
    } finally {
      setLoading(false);
    }
  }

  function patchDraft(patch: Partial<OutboundDraft>) {
    if (!draft) return;
    onActionChange({
      ...action,
      outboundDraft: { ...draft, ...patch, source: "manual" },
    });
  }

  function approveDraft() {
    if (!draft) return;
    recordApprovedDraft();
    onActionChange({
      ...action,
      outboundDraft: { ...draft, status: "approved", approvedAt: nowIso() },
    });
    setMessage("Draft approved. Open your mail app when you are ready. Nothing sends automatically.");
  }

  function dismissDraft() {
    if (!draft) return;
    onActionChange({
      ...action,
      outboundDraft: { ...draft, status: "dismissed" },
    });
    setMessage("Draft dismissed.");
  }

  function markSent() {
    if (!draft) return;
    recordSentDraft();
    onActionChange({
      ...action,
      status: "completed",
      outboundDraft: { ...draft, status: "sent", sentAt: nowIso() },
    });
    setMessage("Marked sent and completed.");
  }

  async function copyLinkedInDraft() {
    if (!draft?.body) return;
    try {
      await navigator.clipboard.writeText(draft.body);
      setMessage("LinkedIn message copied.");
    } catch {
      setMessage("Copy failed. Select the text manually.");
    }
  }

  async function sendViaConnected(provider: "google" | "microsoft") {
    if (!draft || !context.personEmail) {
      setMessage("Add the recipient email on the People record before sending.");
      return;
    }
    setSending(provider);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          to: context.personEmail,
          subject: draft.subject,
          body: draft.body,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(payload.error || "We couldn’t send this message.");
        return;
      }
      markSent();
      setMessage(`Sent via connected ${provider === "google" ? "Gmail" : "Outlook"}.`);
    } catch {
      setMessage("We couldn’t send this message.");
    } finally {
      setSending("");
    }
  }

  const composeLinks = draft && draft.status === "approved"
    ? composeLinksForDraft(action, draft, context)
    : [];
  const linkedInLink = action.channel === "linkedin" ? resolveActionLink(action, context) : null;

  return (
    <section className={`outbound-draft ${compact ? "outbound-draft-compact" : ""}`}>
      <header className="outbound-draft-header">
        <div>
          <strong>Review-first outbound</strong>
          <small>Draft, edit, approve, then send yourself. AfterMeet never auto-sends.</small>
        </div>
        {!draft || draft.status === "dismissed" ? (
          <Button size="small" loading={loading} onClick={() => void generateDraft()}>
            <MagicWandIcon size={15} weight="bold" />Draft message
          </Button>
        ) : null}
      </header>

      {draft && draft.status !== "dismissed" ? (
        <>
          <div className="outbound-draft-meta">
            <span className={`outbound-status outbound-status-${draft.status}`}>{draft.status}</span>
            <small>{draft.source === "ai" ? "AI draft" : draft.source === "manual" ? "Edited by you" : "Template draft"}</small>
          </div>
          {action.channel !== "linkedin" ? (
            <TextField
              label="Subject"
              value={draft.subject}
              onChange={(event) => patchDraft({ subject: event.target.value })}
            />
          ) : null}
          <TextAreaField
            label={action.channel === "linkedin" ? "LinkedIn message" : "Message"}
            rows={compact ? 4 : 6}
            value={draft.body}
            onChange={(event) => patchDraft({ body: event.target.value })}
          />
          <div className="outbound-draft-actions">
            {draft.status === "proposed" ? (
              <>
                <Button size="small" onClick={approveDraft}><CheckCircleIcon size={15} weight="bold" />Approve draft</Button>
                <Button size="small" variant="ghost" onClick={dismissDraft}><XCircleIcon size={15} weight="bold" />Dismiss</Button>
              </>
            ) : null}
            {draft.status === "approved" ? (
              <>
                {integrations.google.connected ? (
                  <Button size="small" loading={sending === "google"} onClick={() => void sendViaConnected("google")}>
                    <PaperPlaneTiltIcon size={15} weight="bold" />Send via Gmail
                  </Button>
                ) : null}
                {integrations.microsoft.connected ? (
                  <Button size="small" loading={sending === "microsoft"} onClick={() => void sendViaConnected("microsoft")}>
                    <PaperPlaneTiltIcon size={15} weight="bold" />Send via Outlook
                  </Button>
                ) : null}
                {composeLinks.map((link) => (
                  <LinkButton
                    key={link.label}
                    size="small"
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                  >
                    <PaperPlaneTiltIcon size={15} weight="bold" />{link.label}
                    {link.external ? <ArrowSquareOutIcon size={14} weight="bold" /> : null}
                  </LinkButton>
                ))}
                {linkedInLink && !linkedInLink.unavailableReason ? (
                  <>
                    <LinkButton size="small" href={linkedInLink.href} target="_blank" rel="noreferrer">
                      {linkedInLink.label}<ArrowSquareOutIcon size={14} weight="bold" />
                    </LinkButton>
                    <Button size="small" variant="secondary" onClick={() => void copyLinkedInDraft()}>
                      <CopyIcon size={15} weight="bold" />Copy message
                    </Button>
                  </>
                ) : null}
                <Button size="small" onClick={markSent}><CheckCircleIcon size={15} weight="bold" />I sent it</Button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {message ? <p className="outbound-draft-message" role="status">{message}</p> : null}
    </section>
  );
}

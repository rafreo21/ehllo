"use client";

import { useEffect, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Clock as ClockIcon } from "react-feather";
import { Mail as MailIcon } from "react-feather";
import { X as XIcon } from "react-feather";
import { ActionDoButton } from "./ActionDoButton";
import { Button } from "./Button";
import { EncounterDrawerView } from "./EncounterDrawerView";
import { OutboundDraftPanel } from "./OutboundDraftPanel";
import { buildActionLinkContext, buildRequestEmailLink, channelLabel, resolveActionLink } from "../../lib/action-links";
import { findContactById } from "../../lib/contacts";
import { readEncounters, updateEncounter, writeEncounter, type Encounter, type EncounterAction } from "../../lib/encounters";
import { supportsOutboundDraft } from "../../lib/outbound-habit";

async function patchAction(encounterId: string, action: EncounterAction) {
  await fetch(`/api/encounters/${encodeURIComponent(encounterId)}/actions/${encodeURIComponent(action.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).catch(() => undefined);
}

export function FollowUpDetailDrawer({
  encounterId,
  actionId,
  onClose,
  onChanged,
  stacked = false,
}: {
  encounterId: string;
  actionId: string;
  onClose: () => void;
  onChanged?: () => void;
  stacked?: boolean;
}) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [activeEncounterId, setActiveEncounterId] = useState("");

  useEffect(() => {
    const cached = readEncounters().find((item) => item.id === encounterId);
    if (cached) setEncounter(cached);
    void fetch(`/api/encounters/${encodeURIComponent(encounterId)}`)
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { encounter?: Encounter };
        if (payload.encounter) {
          writeEncounter(payload.encounter);
          setEncounter(payload.encounter);
        }
      })
      .catch(() => undefined);
  }, [encounterId]);

  const action = encounter?.actions.find((item) => item.id === actionId) ?? null;

  function applyUpdate(update: (current: EncounterAction) => EncounterAction) {
    if (!action) return;
    const nextAction = update(action);
    const updated = updateEncounter(encounterId, (current) => ({
      ...current,
      actions: current.actions.map((item) => item.id === actionId ? nextAction : item),
    }));
    if (updated) setEncounter(updated);
    void patchAction(encounterId, nextAction);
    onChanged?.();
  }

  function snooze() {
    const snoozeTarget = new Date();
    snoozeTarget.setDate(snoozeTarget.getDate() + 1);
    applyUpdate((current) => ({ ...current, status: "snoozed", snoozedUntil: snoozeTarget.toISOString(), statusUpdatedAt: new Date().toISOString() }));
    onClose();
  }

  function complete() {
    applyUpdate((current) => ({ ...current, status: "completed", completedAt: new Date().toISOString(), snoozedUntil: undefined, statusUpdatedAt: new Date().toISOString() }));
    onClose();
  }

  function dismiss() {
    applyUpdate((current) => ({ ...current, status: "dismissed", dismissedAt: new Date().toISOString(), statusUpdatedAt: new Date().toISOString() }));
    onClose();
  }

  return (
    <div className={`followup-drawer-backdrop${stacked ? " followup-drawer-backdrop-stacked" : ""}`} role="presentation" onClick={onClose}>
      <div className="followup-drawer" role="dialog" aria-label="Follow-up details" onClick={(event) => event.stopPropagation()}>
        <div className="followup-drawer-header">
          {activeEncounterId ? (
            <button type="button" className="encounter-drawer-back" onClick={() => setActiveEncounterId("")}>
              <ArrowLeftIcon size={15} />Back
            </button>
          ) : (
            <div>
              <h2>{action?.title ?? "Follow-up"}</h2>
              <p>{encounter?.personName || "Meeting follow-ups"}</p>
            </div>
          )}
          <div className="followup-drawer-header-actions">
            <button type="button" aria-label="Close" onClick={onClose}><XIcon size={18} /></button>
          </div>
        </div>
        {activeEncounterId ? (
          <EncounterDrawerView encounterId={activeEncounterId} />
        ) : encounter && action ? (() => {
          const contact = encounter.contactId ? findContactById(encounter.contactId) : null;
          const context = buildActionLinkContext(encounter, contact, action);
          const primary = resolveActionLink(action, context);
          const canRequest = primary.unavailableReason && context.personEmail;
          return (
            <div className="followup-drawer-body">
              <div className="followup-drawer-meta">
                <span className="inbox-channel">{channelLabel(action.channel)}</span>
                <span className="table-date"><ClockIcon size={14} />{action.dueAt || "No due date"}</span>
              </div>
              <div className="followup-drawer-actions">
                {canRequest ? (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => window.open(buildRequestEmailLink(context, action.channel), "_blank", "noreferrer")}
                  ><MailIcon size={16} />Request {channelLabel(action.channel)}</Button>
                ) : (
                  <ActionDoButton action={action} context={context} showSecondary />
                )}
                <Button size="small" variant="secondary" onClick={snooze}><ClockIcon size={16} />Snooze</Button>
                <Button size="small" variant="secondary" onClick={complete}><CheckCircleIcon size={16} />Done</Button>
                <Button size="small" variant="secondary" onClick={dismiss}>Dismiss</Button>
                <Button size="small" variant="secondary" onClick={() => setActiveEncounterId(encounter.id)}>View full context</Button>
              </div>
              {supportsOutboundDraft(action.channel) ? (
                <OutboundDraftPanel
                  compact
                  encounter={encounter}
                  action={action}
                  context={context}
                  contact={contact}
                  onActionChange={(next) => applyUpdate(() => next)}
                />
              ) : null}
            </div>
          );
        })() : null}
      </div>
    </div>
  );
}

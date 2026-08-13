"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { MagicWandIcon } from "@phosphor-icons/react/dist/csr/MagicWand";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { BusinessShell } from "../../components/BusinessShell";
import { OutboundDraftPanel } from "../../components/OutboundDraftPanel";
import { PageSkeleton, StatusMessage } from "../../components/AsyncState";
import { Button, LinkButton } from "../../components/Button";
import { buildActionLinkContext, channelLabel } from "../../../lib/action-links";
import { findContactById } from "../../../lib/contacts";
import {
  isOutboundHabitProven,
  outboundHabitRequirement,
  readOutboundHabit,
  supportsOutboundDraft,
} from "../../../lib/outbound-habit";
import { readEncounters, updateEncounter, type Encounter, type EncounterAction } from "../../../lib/encounters";
import "../../app/product.css";
import "../../app/flow.css";

type QueueItem = {
  encounter: Encounter;
  action: EncounterAction;
};

export default function OutboundPage() {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [habit, setHabit] = useState(readOutboundHabit());

  useEffect(() => {
    queueMicrotask(() => {
      setEncounters(readEncounters());
      setHabit(readOutboundHabit());
      setHydrated(true);
    });
  }, []);

  const queue = useMemo<QueueItem[]>(() => encounters.flatMap((encounter) => encounter.actions
    .filter((action) => action.owner === "me"
      && action.status !== "completed"
      && action.status !== "proposed"
      && supportsOutboundDraft(action.channel))
    .map((action) => ({ encounter, action }))), [encounters]);

  const habitProven = isOutboundHabitProven();
  const requirement = outboundHabitRequirement();
  const draftableWithoutDraft = queue.filter(({ action }) => !action.outboundDraft || action.outboundDraft.status === "dismissed");

  function refresh() {
    setEncounters(readEncounters());
    setHabit(readOutboundHabit());
  }

  function saveAction(encounterId: string, nextAction: EncounterAction) {
    updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === nextAction.id ? nextAction : action),
    }));
    refresh();
  }

  async function generateAllDrafts() {
    if (!habitProven || !draftableWithoutDraft.length) return;
    setBulkLoading(true);
    setMessage("");
    let created = 0;

    for (const { encounter, action } of draftableWithoutDraft) {
      const contact = encounter.contactId ? findContactById(encounter.contactId) : null;
      try {
        const response = await fetch("/api/encounters/outbound-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ encounter, action, contact }),
        });
        const payload = await response.json() as {
          draft?: { subject: string; body: string };
          source?: "ai" | "heuristic";
          generatedAt?: string;
        };
        if (!response.ok || !payload.draft) continue;
        saveAction(encounter.id, {
          ...action,
          outboundDraft: {
            subject: payload.draft.subject,
            body: payload.draft.body,
            status: "proposed",
            source: payload.source || "heuristic",
            generatedAt: payload.generatedAt || new Date().toISOString(),
          },
        });
        created += 1;
      } catch {
        // continue with remaining items
      }
    }

    setBulkLoading(false);
    setMessage(created
      ? `${created} draft${created === 1 ? "" : "s"} ready for review. Nothing was sent.`
      : "No drafts were created. Try again from a single action first.");
  }

  return (
    <BusinessShell
      active="outbound"
      title="Outbound queue"
      subtitle="Business product: review-first draft queue. Not part of the consumer pilot."
    >
      <div className="flow-page">
        <div className="flow-heading">
          <div>
            <h1>Draft before you send.</h1>
            <p>Autonomous outbound unlocks only after you prove the review habit. Complete follow-ups or send approved drafts first.</p>
          </div>
          <LinkButton href="/app/followups"><PaperPlaneTiltIcon size={17} weight="bold" />Open Inbox</LinkButton>
        </div>

        <section className="outbound-habit-card">
          <strong>{habitProven ? "Review habit proven" : "Build your review habit"}</strong>
          <p>
            {habitProven
              ? "Bulk draft generation is unlocked. You still approve every message before sending."
              : `Send ${requirement.sentDrafts} approved drafts or complete ${requirement.completedActions} follow-ups to unlock bulk drafting.`}
          </p>
          <div className="outbound-habit-stats">
            <span>{habit.sentDrafts} sent drafts</span>
            <span>{habit.completedActions} completed follow-ups</span>
            <span>{habit.approvedDrafts} approved drafts</span>
          </div>
          {habitProven ? (
            <Button loading={bulkLoading} disabled={!draftableWithoutDraft.length} onClick={() => void generateAllDrafts()}>
              <MagicWandIcon size={17} weight="bold" />Generate drafts for queue ({draftableWithoutDraft.length})
            </Button>
          ) : null}
        </section>

        {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}

        {!hydrated ? <PageSkeleton rows={3} /> : queue.length ? (
          <div className="outbound-queue">
            {queue.map(({ encounter, action }) => {
              const contact = encounter.contactId ? findContactById(encounter.contactId) : null;
              const context = buildActionLinkContext(encounter, contact);
              return (
                <article className="outbound-queue-item" key={action.id}>
                  <header>
                    <span className="inbox-channel">{channelLabel(action.channel)}</span>
                    <div>
                      <h2>{action.title}</h2>
                      <p>{encounter.personName || encounter.title}</p>
                      <small><ClockIcon size={14} weight="bold" />{action.dueAt ? `Due ${action.dueAt}` : "No due date"}</small>
                    </div>
                    <LinkButton size="small" variant="secondary" href={`/app/encounters/${encounter.id}`}>Review context</LinkButton>
                  </header>
                  <OutboundDraftPanel
                    encounter={encounter}
                    action={action}
                    context={context}
                    contact={contact}
                    onActionChange={(next) => saveAction(encounter.id, next)}
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <span className="empty-icon"><CheckCircleIcon size={32} weight="bold" /></span>
              <h2>No outbound actions waiting</h2>
              <p>Email, send, and LinkedIn actions from your Inbox appear here for review-first drafting.</p>
              <LinkButton href="/app/followups">Go to Inbox</LinkButton>
            </div>
          </div>
        )}
      </div>
    </BusinessShell>
  );
}

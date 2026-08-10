"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { SortAscendingIcon } from "@phosphor-icons/react/dist/csr/SortAscending";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { ActionDoButton } from "../../components/ActionDoButton";
import { PageSkeleton, StatusMessage } from "../../components/AsyncState";
import { Button, LinkButton } from "../../components/Button";
import { buildActionLinkContext, channelLabel } from "../../../lib/action-links";
import { findContactById } from "../../../lib/contacts";
import { hydrateContactsFromServer } from "../../../lib/contacts-sync";
import { readEncounters, updateEncounter, type Encounter, type EncounterAction } from "../../../lib/encounters";
import { isFollowUpTerminal } from "../../../lib/follow-up-lifecycle";
import { hydrateEncountersFromServer } from "../../../lib/encounters-sync";
import { recordCompletedAction, supportsOutboundDraft } from "../../../lib/outbound-habit";
import { OutboundDraftPanel } from "../../components/OutboundDraftPanel";

type Contact = { firstName: string; lastName: string; company: string; context: string; nextAction: string };
type FollowUpScope = "current" | "past";
type FollowUpGroup = { encounter: Encounter; actions: EncounterAction[] };
type FollowUpsSort = "urgency" | "recent" | "az";

function dueBucket(dueAt?: string) {
  if (!dueAt?.trim()) return 4;
  const due = new Date(`${dueAt.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (due < today) return 0;
  if (due.getTime() === today.getTime()) return 1;
  const endOfWeek = new Date(today);
  const day = endOfWeek.getDay();
  endOfWeek.setDate(endOfWeek.getDate() + (day === 0 ? 0 : 7 - day));
  if (due <= endOfWeek) return 2;
  return 3;
}

function filterFollowUpGroups(groups: FollowUpGroup[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups.filter(({ encounter, actions }) => (
    (encounter.personName || "").toLowerCase().includes(needle)
    || encounter.title.toLowerCase().includes(needle)
    || actions.some((action) => action.title.toLowerCase().includes(needle) || action.channel.toLowerCase().includes(needle))
  ));
}

function sortFollowUpGroups(groups: FollowUpGroup[], sort: FollowUpsSort) {
  const next = [...groups];
  if (sort === "az") {
    next.sort((left, right) => (left.encounter.personName || "").localeCompare(right.encounter.personName || "", undefined, { sensitivity: "base" }));
    return next;
  }
  if (sort === "recent") {
    next.sort((left, right) => {
      const leftDate = left.actions[0]?.completedAt || left.encounter.startedAt;
      const rightDate = right.actions[0]?.completedAt || right.encounter.startedAt;
      return rightDate.localeCompare(leftDate);
    });
    return next;
  }
  next.sort((left, right) => {
    const leftBucket = Math.min(...left.actions.map((action) => dueBucket(action.dueAt)));
    const rightBucket = Math.min(...right.actions.map((action) => dueBucket(action.dueAt)));
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;
    return right.encounter.startedAt.localeCompare(left.encounter.startedAt);
  });
  return next;
}

function participantName(encounter: Encounter, action: EncounterAction) {
  if (action.owner !== "guest") return "You";
  const matched = action.participantId
    ? encounter.participants?.find((person) => person.id === action.participantId)
    : null;
  return matched?.name.trim() || encounter.personName || "Guest";
}

function completedLabel(completedAt?: string) {
  if (!completedAt) return "Completed";
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return "Completed";
  return `Completed ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function FollowupsPage() {
  const [contact, setContact] = useState<Contact | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [done, setDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [scope, setScope] = useState<FollowUpScope>("current");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FollowUpsSort>("urgency");
  const [sortOpen, setSortOpen] = useState(false);

  async function loadEncounters(isRetry = false) {
    if (isRetry) setRetrying(true);
    setError("");
    try { const value = localStorage.getItem("aftermeet-last-contact-v1"); if (value) setContact(JSON.parse(value)); } catch {}
    try {
      const [, nextEncounters] = await Promise.all([
        hydrateContactsFromServer(),
        hydrateEncountersFromServer(),
      ]);
      setEncounters(nextEncounters);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t load your follow-ups. Check your connection and try again.");
    } finally {
      setHydrated(true);
      setRetrying(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadEncounters());
  }, []);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState !== "hidden") void loadEncounters();
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
  }, []);

  const allActions = useMemo(
    // A follow-up proposed during capture stays attached to its encounter
    // while review is pending; it must not surface here as actionable until
    // the encounter has been reviewed. Mirrors flattenOpenFollowUps' gate.
    () => encounters
      .filter((encounter) => encounter.status !== "draft")
      .flatMap((encounter) => encounter.actions
        .filter((action) => action.status !== "proposed")
        .map((action) => ({ encounter, action }))),
    [encounters],
  );
  const visibleActions = useMemo(
    () => {
      const filtered = allActions.filter(({ action }) => (
        scope === "past" ? isFollowUpTerminal(action.status) : !isFollowUpTerminal(action.status)
      ));
      if (scope !== "past") return filtered;
      return [...filtered].sort((left, right) => (
        (right.action.completedAt || right.encounter.startedAt)
          .localeCompare(left.action.completedAt || left.encounter.startedAt)
      ));
    },
    [allActions, scope],
  );
  const rawFollowUpGroups = useMemo(() => {
    const groups = new Map<string, FollowUpGroup>();
    for (const { encounter, action } of visibleActions) {
      const current = groups.get(encounter.id);
      if (current) current.actions.push(action);
      else groups.set(encounter.id, { encounter, actions: [action] });
    }
    return Array.from(groups.values());
  }, [visibleActions]);
  const followUpGroups = useMemo(
    () => sortFollowUpGroups(filterFollowUpGroups(rawFollowUpGroups, query), sort),
    [rawFollowUpGroups, query, sort],
  );
  const guestCommitments = useMemo(() => encounters.flatMap((encounter) => {
    const rows = encounter.guestFollowUps?.length
      ? encounter.guestFollowUps
      : encounter.guestFollowUp
        ? [encounter.guestFollowUp]
        : [];
    return rows
      .filter((commitment) => commitment.note?.trim())
      .map((commitment, index) => ({
        encounter,
        commitment,
        key: commitment.id || `${encounter.id}-${commitment.committedAt}-${index}`,
      }));
  }), [encounters]);

  function completeAction(encounterId: string, actionId: string) {
    const completedAt = new Date().toISOString();
    const updated = updateEncounter(encounterId, (encounter) => ({ ...encounter, actions: encounter.actions.map((action) => action.id === actionId ? { ...action, status: "completed", completedAt, snoozedUntil: undefined, statusUpdatedAt: completedAt } : action) }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    recordCompletedAction();
    setEncounters(readEncounters());
    setMessage("Follow-up marked complete.");
  }

  function reopenAction(encounterId: string, actionId: string) {
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId
        ? { ...action, status: "open", completedAt: undefined, dismissedAt: undefined, cancelledAt: undefined, snoozedUntil: undefined, statusUpdatedAt: new Date().toISOString() }
        : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
    setMessage("Follow-up moved back to Current.");
  }

  function snoozeAction(encounterId: string, actionId: string) {
    const snoozeTarget = new Date();
    snoozeTarget.setDate(snoozeTarget.getDate() + 1);
    const snoozedUntil = snoozeTarget.toISOString();
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId
        ? { ...action, status: "snoozed", snoozedUntil, statusUpdatedAt: new Date().toISOString() }
        : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
    setMessage("Follow-up snoozed until tomorrow.");
  }

  function dismissAction(encounterId: string, actionId: string) {
    const dismissedAt = new Date().toISOString();
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId
        ? { ...action, status: "dismissed", dismissedAt, statusUpdatedAt: dismissedAt }
        : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
    setMessage("Follow-up dismissed. You can reopen it from Past.");
  }

  function saveAction(encounterId: string, actionId: string, nextAction: Encounter["actions"][number]) {
    const updated = updateEncounter(encounterId, (encounter) => ({
      ...encounter,
      actions: encounter.actions.map((action) => action.id === actionId ? nextAction : action),
    }));
    const action = updated?.actions.find((item) => item.id === actionId);
    if (action) void patchAction(encounterId, action);
    setEncounters(readEncounters());
  }

  async function patchAction(encounterId: string, action: EncounterAction) {
    const response = await fetch(`/api/encounters/${encodeURIComponent(encounterId)}/actions/${encodeURIComponent(action.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      setMessage("This change is saved locally but could not sync. Try again when you’re online.");
    }
  }

  return (
    <>
      <div className="flow-page">
        <div className="flow-heading"><div><h1>Keep the promise.</h1><p className="flow-heading-copy-wide">Nothing is sent automatically. Review the context, take the action, then mark it complete.</p></div><div className="flow-heading-actions"><LinkButton variant="secondary" href="/app/followups/new"><PlusIcon size={17} weight="bold" />Add follow-up</LinkButton><LinkButton href="/app/encounters/new"><MicrophoneIcon size={17} weight="fill" />Capture</LinkButton></div></div>
        {message && <StatusMessage tone="success" action={<Button size="small" variant="ghost" onClick={() => setMessage("")}>Dismiss</Button>}>{message}</StatusMessage>}
        {error && (
          <StatusMessage
            tone="error"
            action={<Button size="small" variant="secondary" disabled={retrying} onClick={() => void loadEncounters(true)}>{retrying ? "Retrying…" : "Retry"}</Button>}
          >
            {error}
          </StatusMessage>
        )}
        <div className="followups-tabs">
          <button type="button" className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>Current</button>
          <button type="button" className={scope === "past" ? "active" : ""} onClick={() => setScope("past")}>Past</button>
        </div>
        {hydrated && scope === "current" && guestCommitments.length ? (
          <section className="guest-commitments" aria-labelledby="guest-commitments-heading">
            <header>
              <div><h2 id="guest-commitments-heading">What others said they&apos;ll do</h2></div>
              <small>These are confirmations, not tasks assigned to you.</small>
            </header>
            <div className="inbox-list">
              {guestCommitments.map(({ encounter, commitment, key }) => (
                <article className="inbox-item guest-commitment-item" key={key}>
                  <CheckCircleIcon size={22} weight="fill" />
                  <div>
                    <h2>{commitment.note}</h2>
                    <p>{commitment.guestName || encounter.personName || "Meeting participant"} <span className="owner-tag">Confirmed</span>{" · "}{encounter.title}</p>
                    <small>{commitment.channel ? `${commitment.channel} · ` : ""}{commitment.dueAt ? `Due ${commitment.dueAt} · ` : ""}Shared {new Date(commitment.committedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
                  </div>
                  <div className="inbox-actions"><LinkButton size="small" variant="secondary" href={`/app/encounters/${encounter.id}`}>Review context</LinkButton></div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {!hydrated ? <PageSkeleton rows={3} /> : rawFollowUpGroups.length ? (
          <section className="followup-plan" aria-labelledby="your-followups-heading">
            <div className="connections-toolbar">
              <label className="connections-search">
                <MagnifyingGlassIcon size={18} weight="bold" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search follow-ups" />
              </label>
              <Button size="small" variant="secondary" onClick={() => setSortOpen(true)} aria-label="Sort follow-ups">
                <SortAscendingIcon size={16} weight="bold" />
                {sort === "urgency" ? "Priority" : sort === "recent" ? "Most recent" : "A–Z"}
              </Button>
            </div>
            <div className="followup-section-heading">
              <div><h2 id="your-followups-heading">{scope === "current" ? "Your follow-ups" : "Past follow-ups"}</h2></div>
              {followUpGroups.length ? (
                <p>{followUpGroups.reduce((total, group) => total + group.actions.length, 0)} {followUpGroups.reduce((total, group) => total + group.actions.length, 0) === 1 ? "action" : "actions"} across {followUpGroups.length} {followUpGroups.length === 1 ? "meeting" : "meetings"}</p>
              ) : <p>No follow-ups match your search.</p>}
            </div>
            <div className="followup-groups">
              {followUpGroups.length ? (
              <article className="followup-group">
                  <div className="data-table-shell followup-table-shell">
                    <table className="data-table followup-table">
                      <thead>
                        <tr>
                          <th scope="col">Follow-up</th>
                          <th scope="col">Owner</th>
                          <th scope="col">Due</th>
                          <th scope="col"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                    {followUpGroups.flatMap(({ encounter, actions }) => actions.map((action) => {
                      const context = buildActionLinkContext(
                        encounter,
                        encounter.contactId ? findContactById(encounter.contactId) : null,
                        action,
                      );
                      const isPast = isFollowUpTerminal(action.status);
                      return (
                        <Fragment key={action.id}>
                          <tr className="followup-table-row">
                            <td data-label="Follow-up">
                              <div className="followup-table-action">
                                <span className="inbox-channel">{channelLabel(action.channel)}</span>
                                <div className="followup-action-copy">
                              <h4>{action.title}</h4>
                                  <p>{encounter.personName || "Meeting follow-ups"}</p>
                                </div>
                              </div>
                            </td>
                            <td data-label="Owner">{participantName(encounter, action)}{action.owner === "guest" ? <span className="owner-tag">Their turn</span> : null}</td>
                            <td data-label={isPast ? "Completed" : "Due"}><span className="table-date"><ClockIcon size={14} weight="bold" />{isPast ? completedLabel(action.completedAt) : action.dueAt || "No due date"}</span></td>
                            <td className="followup-table-controls">
                              <div className="inbox-actions">
                                {isPast ? (
                                  <Button size="small" variant="secondary" onClick={() => reopenAction(encounter.id, action.id)}>Reopen</Button>
                                ) : (
                                  <>
                                    <ActionDoButton action={action} context={context} showSecondary />
                                    <Button size="small" variant="secondary" onClick={() => snoozeAction(encounter.id, action.id)}><ClockIcon size={16} weight="bold" />Snooze</Button>
                                    <Button size="small" variant="secondary" onClick={() => completeAction(encounter.id, action.id)}><CheckCircleIcon size={16} weight="bold" />Done</Button>
                                    <Button size="small" variant="secondary" onClick={() => dismissAction(encounter.id, action.id)}>Dismiss</Button>
                                    <LinkButton size="small" variant="secondary" href={`/app/encounters/${encounter.id}`}>View</LinkButton>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {!isPast && supportsOutboundDraft(action.channel) ? (
                            <tr className="followup-draft-row">
                              <td colSpan={4}>
                                <OutboundDraftPanel
                                  compact
                                  encounter={encounter}
                                  action={action}
                                  context={context}
                                  contact={encounter.contactId ? findContactById(encounter.contactId) : null}
                                  onActionChange={(next) => saveAction(encounter.id, action.id, next)}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    }))}
                      </tbody>
                    </table>
                  </div>
              </article>
              ) : null}
            </div>
          </section>
        ) : scope === "current" && contact ? <div className="follow-list"><article className="follow-card"><div><h2>{contact.firstName} {contact.lastName}{contact.company ? ` · ${contact.company}` : ""}</h2><p>{contact.nextAction || "Send a thoughtful follow-up based on the meeting context."}</p>{contact.context && <p><strong>Context:</strong> {contact.context}</p>}</div>{done ? <CheckCircleIcon size={42} weight="fill" /> : <Button onClick={() => { setDone(true); setMessage("Follow-up marked complete."); }}><PaperPlaneTiltIcon size={18} weight="bold" />Mark complete</Button>}</article></div> : error ? (
          <div className="empty-state">
            <div>
              <span className="empty-icon"><PaperPlaneTiltIcon size={32} weight="bold" /></span>
              <h2>Couldn’t load your follow-ups</h2>
              <p>We couldn’t confirm whether anything is due. This isn’t the same as being caught up. Check your connection and try again.</p>
              <div className="empty-state-actions">
                <Button disabled={retrying} onClick={() => void loadEncounters(true)}>{retrying ? "Retrying…" : "Retry"}</Button>
              </div>
            </div>
          </div>
        ) : <div className="empty-state"><div><span className="empty-icon"><PaperPlaneTiltIcon size={32} weight="bold" /></span><h2>{scope === "current" ? "Your Inbox is clear" : "No past follow-ups yet"}</h2><p>{scope === "current" ? "Add a next step directly, or capture a conversation and turn its commitments into follow-ups." : "Completed follow-ups will appear here after you check them off."}</p>{scope === "current" ? <div className="empty-state-actions"><LinkButton href="/app/followups/new"><PlusIcon size={16} weight="bold" />Add follow-up</LinkButton><LinkButton variant="secondary" href="/app/encounters/new">Capture conversation</LinkButton></div> : null}</div></div>}
      </div>

      {sortOpen ? (
        <div className="connections-modal-backdrop" role="presentation" onClick={() => setSortOpen(false)}>
          <div className="connections-modal connections-modal-compact" role="dialog" aria-label="Sort by" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Sort by</h2>
              <button type="button" aria-label="Close" onClick={() => setSortOpen(false)}><XIcon size={18} weight="bold" /></button>
            </header>
            <div className="connections-add-options">
              <Button variant={sort === "urgency" ? "primary" : "secondary"} onClick={() => { setSort("urgency"); setSortOpen(false); }}>Priority</Button>
              <Button variant={sort === "recent" ? "primary" : "secondary"} onClick={() => { setSort("recent"); setSortOpen(false); }}>Most recent</Button>
              <Button variant={sort === "az" ? "primary" : "secondary"} onClick={() => { setSort("az"); setSortOpen(false); }}>A–Z</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown as ArrowDownIcon } from "react-feather";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { ArrowRight as ArrowRightIcon } from "react-feather";
import { ArrowUp as ArrowUpIcon } from "react-feather";
import { Check as CheckIcon } from "react-feather";
import { Button, LinkButton } from "../components/Button";
import "./hub.css";

type Item = {
  id: string;
  title: string;
  detail: string;
  priority: "Critical" | "Important" | "Later";
  gate?: boolean;
};

type HubStatus = "not_started" | "in_progress" | "prototype" | "validated" | "production_ready";

type EvidenceRecord = {
  text: string;
  link?: string;
  lastUpdated?: string;
};

type Phase = {
  id: string;
  number: string;
  emoji: string;
  title: string;
  subtitle: string;
  items: Item[];
};

const phases: Phase[] = [
  {
    id: "foundation",
    number: "01",
    emoji: "🧭",
    title: "Product foundation",
    subtitle: "Make sure we are solving a real, narrow problem.",
    items: [
      { id: "web-first", title: "Commit to a responsive web app first", detail: "One mobile-first PWA codebase for the public card and private workspace; native apps only when usage proves the need.", priority: "Critical", gate: true },
      { id: "segment", title: "Choose one initial customer segment", detail: "Default hypothesis: independent consultants and agencies with 2–20 people.", priority: "Critical", gate: true },
      { id: "problem", title: "Write the one-sentence problem statement", detail: "Describe the painful job without mentioning our proposed product.", priority: "Critical" },
      { id: "promise", title: "Confirm the product promise", detail: "After every important meeting, know who you met, what mattered, and what to do next.", priority: "Critical" },
      { id: "metric", title: "Lock the primary success metric", detail: "Completed follow-up within 72 hours of capturing a contact.", priority: "Critical" },
      { id: "principles", title: "Agree product principles", detail: "Fast capture, user-reviewed AI, no recipient account, private by default.", priority: "Important" },
      { id: "brand", title: "Decide whether ehllo remains the working name", detail: "Check domains and trademarks only after the concept survives validation.", priority: "Later" },
    ],
  },
  {
    id: "discovery",
    number: "02",
    emoji: "🔎",
    title: "Customer discovery",
    subtitle: "Collect evidence before committing to the build.",
    items: [
      { id: "recruit", title: "Recruit 10–15 target users", detail: "Include frequent networkers, inconsistent CRM users, and at least three small-team owners.", priority: "Critical" },
      { id: "script", title: "Prepare a neutral interview script", detail: "Ask about the last real meeting, current workflow, failures, cost, and workarounds.", priority: "Critical" },
      { id: "interviews", title: "Complete 10 customer interviews", detail: "Capture direct evidence and patterns; avoid pitching during the first half.", priority: "Critical", gate: true },
      { id: "workflow", title: "Map the current meeting-to-follow-up journey", detail: "Identify triggers, tools, delays, handoffs, anxieties, and abandoned steps.", priority: "Important" },
      { id: "rank", title: "Rank the top three recurring pains", detail: "Prioritize frequency × severity × willingness to pay.", priority: "Critical" },
      { id: "pricing-talk", title: "Test willingness to pay", detail: "Ask what the problem costs today and compare £8–12 solo and £29–49 team hypotheses.", priority: "Important" },
    ],
  },
  {
    id: "prototype",
    number: "03",
    emoji: "🧪",
    title: "Prototype & pilot",
    subtitle: "Prove the complete behavior with the least software.",
    items: [
      { id: "flow", title: "Design the end-to-end clickable flow", detail: "Card → return details → meeting note → AI extraction → reviewed follow-up.", priority: "Critical" },
      { id: "test-five", title: "Usability-test with five target users", detail: "Observe without coaching; record where users hesitate or misunderstand.", priority: "Critical" },
      { id: "concierge", title: "Launch a five-user concierge pilot", detail: "Manually help process notes and drafts while measuring real follow-through.", priority: "Critical", gate: true },
      { id: "two-weeks", title: "Run the pilot for two full weeks", detail: "The behavior must repeat across multiple meetings-not just during onboarding.", priority: "Critical" },
      { id: "charge", title: "Ask pilot users to pay", detail: "A small real payment is stronger evidence than positive feedback.", priority: "Critical" },
      { id: "decision", title: "Make a build / revise / stop decision", detail: "Use observed behavior and payment, not enthusiasm alone.", priority: "Critical", gate: true },
    ],
  },
  {
    id: "scope",
    number: "04",
    emoji: "✂️",
    title: "MVP scope",
    subtitle: "Define the smallest complete product-not a feature collection.",
    items: [
      { id: "stories", title: "Write MVP user stories and acceptance criteria", detail: "Cover onboarding, sharing, capture, context, draft review, reminders, and deletion.", priority: "Critical" },
      { id: "card", title: "Public profile card, QR, and vCard", detail: "Mobile-first, accessible, fast, and usable without a recipient account.", priority: "Critical" },
      { id: "reciprocal", title: "Reciprocal contact form", detail: "Collect only necessary fields, record consent, prevent spam, and confirm success.", priority: "Critical" },
      { id: "contacts", title: "Private contacts and encounter timeline", detail: "A contact can have many meetings, each with distinct context and commitments.", priority: "Critical" },
      { id: "notes", title: "Typed and user-initiated voice notes", detail: "No passive recording in the MVP.", priority: "Important" },
      { id: "ai", title: "User-reviewed AI extraction", detail: "Summary, topics, commitments, next action, date, and uncertainty markers.", priority: "Critical" },
      { id: "draft", title: "Editable follow-up draft", detail: "Require review before opening the user’s email client; no autonomous sending.", priority: "Critical" },
      { id: "queue", title: "Daily follow-up queue", detail: "Show what is due, overdue, completed, or deliberately dismissed.", priority: "Critical" },
      { id: "analytics", title: "Essential product analytics", detail: "Track activation and follow-through without collecting unnecessary personal data.", priority: "Important" },
      { id: "exclude", title: "Publish the not-building list", detail: "No NFC fulfillment, native apps, ambient recording, enrichment, or enterprise SSO.", priority: "Critical" },
    ],
  },
  {
    id: "design",
    number: "05",
    emoji: "🎨",
    title: "Experience design",
    subtitle: "Make the core loop feel lighter than doing nothing.",
    items: [
      { id: "architecture", title: "Finalize information architecture", detail: "Home, contacts, encounter capture, follow-up queue, profile, and settings.", priority: "Critical" },
      { id: "connected-prototype", title: "Connect the full local prototype journey", detail: "Sign in → onboarding → card → QR → contact capture → reviewed follow-up.", priority: "Critical", gate: true },
      { id: "entitlements", title: "Define the free and paid entitlement boundary", detail: "Keep the complete core loop free during validation; defer team and advanced controls.", priority: "Important" },
      { id: "mobile", title: "Design mobile-first core screens", detail: "Sharing and post-meeting capture will often happen while standing or walking.", priority: "Critical" },
      { id: "states", title: "Design empty, loading, error, and offline states", detail: "Do not treat failure states as an engineering afterthought.", priority: "Important" },
      { id: "a11y", title: "Set accessibility requirements", detail: "Keyboard support, semantic controls, contrast, focus, labels, and reduced motion.", priority: "Critical" },
      { id: "trust", title: "Design AI review and trust cues", detail: "Make extracted facts, uncertainty, original notes, and edit controls obvious.", priority: "Critical" },
      { id: "system", title: "Create a compact design system", detail: "Tokens and reusable controls only after the primary flows stabilize.", priority: "Important" },
    ],
  },
  {
    id: "engineering",
    number: "06",
    emoji: "🛠️",
    title: "Build & quality",
    subtitle: "Ship a reliable core with boring, trustworthy foundations.",
    items: [
      { id: "auth-screen", title: "Create the combined sign-in and sign-up experience", detail: "One email-first entry point that detects whether to sign in an existing user or create a new account.", priority: "Critical" },
      { id: "auth-provider", title: "Choose and configure the production authentication provider", detail: "Confirm support for magic links, Google, Microsoft, Apple, secure sessions, and account linking.", priority: "Critical", gate: true },
      { id: "magic-link", title: "Implement email magic-link authentication", detail: "Single-use, short-lived links with resend limits and safe redirect handling.", priority: "Critical" },
      { id: "social-auth", title: "Implement priority social providers", detail: "Start with Google and Microsoft; add Apple only when customer demand or platform requirements justify it.", priority: "Important" },
      { id: "session-security", title: "Protect private routes and user-owned data", detail: "Enforce authentication and authorization on the server, including session expiry and sign-out.", priority: "Critical" },
      { id: "model", title: "Confirm data model and privacy boundaries", detail: "Separate public profiles from private contacts, encounters, notes, and commitments.", priority: "Critical" },
      { id: "auth", title: "Implement secure authentication", detail: "Magic links or passkeys, secure sessions, rate limiting, and recovery.", priority: "Critical" },
      { id: "jobs", title: "Build resilient AI background jobs", detail: "Retries, idempotency, clear status, structured output validation, and failure recovery.", priority: "Critical" },
      { id: "dedupe", title: "Implement contact deduplication", detail: "Start with normalized email and phone; let users resolve uncertain matches.", priority: "Important" },
      { id: "security", title: "Complete security review", detail: "Authorization, data exposure, uploads, secrets, abuse controls, and dependency risk.", priority: "Critical", gate: true },
      { id: "privacy", title: "Implement export, deletion, and retention", detail: "Users must be able to retrieve and remove their data.", priority: "Critical" },
      { id: "tests", title: "Cover the critical path with automated tests", detail: "Profile publish, detail exchange, note processing, draft review, and completion.", priority: "Critical" },
      { id: "performance", title: "Meet performance budgets", detail: "Fast public cards on mobile connections; avoid blocking the share moment.", priority: "Important" },
      { id: "observability", title: "Add error monitoring and operational alerts", detail: "Know when capture, transcription, AI jobs, or email delivery fail.", priority: "Critical" },
    ],
  },
  {
    id: "launch",
    number: "07",
    emoji: "🚀",
    title: "Pilot launch",
    subtitle: "Release deliberately, learn quickly, and protect user trust.",
    items: [
      { id: "legal", title: "Review privacy, terms, consent, and recording language", detail: "Get qualified legal advice for the launch jurisdictions.", priority: "Critical" },
      { id: "onboarding", title: "Create a five-minute onboarding path", detail: "Publish a card and capture one sample encounter during the first session.", priority: "Critical" },
      { id: "support", title: "Set up support and feedback channels", detail: "Every pilot user should know exactly where to report confusion or failure.", priority: "Important" },
      { id: "cohort", title: "Recruit the first 20–30 pilot users", detail: "Prefer one coherent segment over a mixed group of friendly testers.", priority: "Critical" },
      { id: "dashboard", title: "Create a weekly metrics review", detail: "Activation, context capture, follow-up completion, retention, failures, and interviews.", priority: "Critical" },
      { id: "response", title: "Prepare incident and data-response procedures", detail: "Define ownership and actions before anything goes wrong.", priority: "Critical" },
      { id: "launch-gate", title: "Pass the MVP launch gate", detail: "Reliable core flow, legal review, support readiness, and measurable pilot cohort.", priority: "Critical", gate: true },
    ],
  },
];

const allItems = phases.flatMap((phase) => phase.items);
const storageKey = "aftermeet-mvp-checklist-v2";
const legacyStorageKey = "aftermeet-mvp-checklist-v1";
const currentDate = "2026-07-24";

const statusOptions: Array<{ value: HubStatus; label: string; description: string }> = [
  { value: "not_started", label: "Not started", description: "No meaningful work or evidence has been recorded." },
  { value: "in_progress", label: "In progress", description: "A decision or implementation is underway, but no complete prototype exists." },
  { value: "prototype", label: "Prototype", description: "A local or test implementation exists. It is not customer-validated or production-ready." },
  { value: "validated", label: "Validated", description: "Target users have tested the capability and evidence supports the intended outcome." },
  { value: "production_ready", label: "Production-ready", description: "Security, durable storage, error handling, accessibility, and critical-path tests are complete." },
];

const defaultStatuses: Partial<Record<string, HubStatus>> = {
  "web-first": "prototype",
  segment: "in_progress",
  problem: "in_progress",
  promise: "in_progress",
  metric: "in_progress",
  principles: "in_progress",
  flow: "prototype",
  card: "prototype",
  contacts: "prototype",
  notes: "prototype",
  queue: "prototype",
  architecture: "prototype",
  "connected-prototype": "prototype",
  entitlements: "in_progress",
  mobile: "prototype",
  states: "in_progress",
  a11y: "in_progress",
  system: "prototype",
  "auth-screen": "prototype",
  model: "in_progress",
  onboarding: "prototype",
};

const evidenceById: Partial<Record<string, EvidenceRecord>> = {
  "web-first": { text: "Responsive browser routes and mobile breakpoints exist. No structured real-device validation has been completed.", lastUpdated: currentDate },
  segment: { text: "The segment is documented as independent consultants and fractional professionals. Customer evidence is still outstanding.", lastUpdated: currentDate },
  problem: { text: "A working problem statement is recorded in docs/product/01-product-foundation.md. It has not yet been validated through discovery.", lastUpdated: currentDate },
  promise: { text: "A working product promise is recorded in docs/product/01-product-foundation.md. It remains a hypothesis.", lastUpdated: currentDate },
  metric: { text: "The primary metric is defined as reviewed follow-up completed within 72 hours. No behavioural baseline exists yet.", lastUpdated: currentDate },
  principles: { text: "Ten product principles are documented, including encounter-first, private-by-default, and no autonomous sending.", lastUpdated: currentDate },
  flow: { text: "A connected local owner-side flow exists from mock sign-in through follow-up. The recipient exchange flow is incomplete.", lastUpdated: currentDate },
  card: { text: "The repository includes a local card editor and QR generation. The QR opens /app, no public account-free card exists, and vCard is missing.", link: "/app/cards", lastUpdated: currentDate },
  contacts: { text: "Local contact creation, search, and meeting context exist. Repeated Encounters and a contact timeline are unsupported.", link: "/business/contacts", lastUpdated: currentDate },
  notes: { text: "Typed private meeting context is available in local contact capture. Voice capture and transcription are not implemented.", link: "/business/contacts/new", lastUpdated: currentDate },
  queue: { text: "A local latest-contact follow-up screen exists. Completion is non-persistent and there is no multi-item daily queue.", link: "/app/followups", lastUpdated: currentDate },
  architecture: { text: "Home, My Card, Contacts, Follow-ups, onboarding, and editing routes exist. Public-card and encounter-detail routes remain missing.", link: "/app", lastUpdated: currentDate },
  "connected-prototype": { text: "The local owner journey is connected. It does not yet include a public card, reciprocal exchange, AI review, or durable completion.", link: "/app", lastUpdated: currentDate },
  entitlements: { text: "The onboarding prototype keeps the individual core loop free and defers team capabilities. Pricing has not been tested.", link: "/onboarding", lastUpdated: currentDate },
  mobile: { text: "Core screens contain responsive layouts. Mobile usability has not been validated with target users or a formal device matrix.", lastUpdated: currentDate },
  states: { text: "Several empty and field-error states exist. Loading, offline, retry, and storage-failure coverage is incomplete.", lastUpdated: currentDate },
  a11y: { text: "Shared controls include labels and focus styles. No formal keyboard, screen-reader, or contrast audit has been completed.", lastUpdated: currentDate },
  system: { text: "Shared Tailwind buttons, fields, form sections, AppShell, Wise-inspired tokens, and Phosphor icons exist. The system is not fully documented or tested.", lastUpdated: currentDate },
  "auth-screen": { text: "A combined email-first sign-in/sign-up screen exists locally. It does not authenticate, protect routes, or create a secure session.", link: "/auth", lastUpdated: currentDate },
  model: { text: "The product foundation defines Encounter as the core object and one Contact to many Encounters. The implemented local model remains contact-first.", lastUpdated: currentDate },
  onboarding: { text: "A local audience and plan-selection flow exists. It does not yet publish a public card or capture a sample encounter.", link: "/onboarding", lastUpdated: currentDate },
};

function getDefaultStatus(id: string): HubStatus {
  return defaultStatuses[id] ?? "not_started";
}

function isHubStatus(value: unknown): value is HubStatus {
  return statusOptions.some((option) => option.value === value);
}

export default function HubPage() {
  const [statuses, setStatuses] = useState<Record<string, HubStatus>>({});
  const [filter, setFilter] = useState<"All" | Item["priority"]>("All");

  useEffect(() => {
    try {
      const defaults = Object.fromEntries(allItems.map((item) => [item.id, getDefaultStatus(item.id)])) as Record<string, HubStatus>;
      const saved = window.localStorage.getItem(storageKey);
      let next = defaults;

      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        const validSaved = Object.entries(parsed).reduce<Record<string, HubStatus>>(
          (result, [id, value]) => {
            if (isHubStatus(value)) result[id] = value;
            return result;
          },
          {},
        );
        next = {
          ...defaults,
          ...validSaved,
        };
      } else {
        const legacy = window.localStorage.getItem(legacyStorageKey);
        if (legacy) {
          const parsedLegacy = JSON.parse(legacy) as Record<string, boolean>;
          next = {
            ...defaults,
            ...Object.fromEntries(
              Object.entries(parsedLegacy).map(([id, checked]) => [
                id,
                checked ? "prototype" : "not_started",
              ]),
            ),
          };
        }
      }

      queueMicrotask(() => setStatuses(next));
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      const defaults = Object.fromEntries(allItems.map((item) => [item.id, getDefaultStatus(item.id)])) as Record<string, HubStatus>;
      queueMicrotask(() => setStatuses(defaults));
    }
  }, []);

  const statusCounts = useMemo(
    () => Object.fromEntries(statusOptions.map((option) => [
      option.value,
      allItems.filter((item) => (statuses[item.id] ?? getDefaultStatus(item.id)) === option.value).length,
    ])) as Record<HubStatus, number>,
    [statuses],
  );

  function statusDistribution(items: Item[]) {
    return statusOptions
      .map((option) => ({
        label: option.label.toLowerCase(),
        count: items.filter((item) => (statuses[item.id] ?? getDefaultStatus(item.id)) === option.value).length,
      }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.count} ${entry.label}`)
      .join(" · ");
  }

  function updateStatus(id: string, status: HubStatus) {
    setStatuses((current) => {
      const next = { ...current, [id]: status };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Keep the in-memory status when storage is unavailable.
      }
      return next;
    });
  }

  return (
    <main className="hub-shell">
      <header className="hub-nav">
        <a className="hub-brand" href="/">
          <span className="hub-brand-mark">A</span>
          <span>ehllo <small>MVP hub</small></span>
        </a>
        <div className="hub-nav-actions">
          <a href="/"><ArrowLeftIcon size={15} /> Strategy</a>
          <a href="/auth">Sign in</a>
          <a href="/app">Open app</a>
          <LinkButton className="hub-nav-cta" size="small" href="#checklist">Checklist <ArrowDownIcon size={15} /></LinkButton>
        </div>
      </header>

      <section className="hub-hero">
        <div>
          <span className="hub-kicker">Delivery control centre</span>
          <h1>Validate the problem.<br /><em>Then earn the build.</em></h1>
          <LinkButton size="small" href="/hub/discovery">Open active discovery phase <ArrowRightIcon size={15} /></LinkButton>
        </div>
        <div className="progress-card">
          <span className="hub-kicker">Status distribution</span>
          <div className="distribution-grid">
            {statusOptions.map((option) => <div key={option.value}><strong>{statusCounts[option.value]}</strong><span>{option.label}</span></div>)}
          </div>
          <small>Prototype = demonstrable. Validated = behavioural evidence. Production-ready = technical, operational, security, and quality requirements met.</small>
        </div>
      </section>

      <section className="now-panel">
        <div>
          <span><b className="inline-emoji" aria-hidden="true">💡</b> Start here</span>
          <h2>Validate before we build.</h2>
        </div>
        <p><strong>Current milestone:</strong> ten evidence-based customer interviews.<br /><strong>Current blocker:</strong> the segment and problem remain unvalidated.</p>
        <LinkButton variant="ghost" href="/hub/discovery">Go to discovery <ArrowRightIcon size={16} /></LinkButton>
      </section>

      <section className="hub-checklist" id="checklist">
        <div className="checklist-toolbar">
          <div>
            <span className="hub-kicker">Master checklist</span>
            <h2>From idea to pilot.</h2>
          </div>
          <div className="filters" aria-label="Filter checklist by priority">
            {(["All", "Critical", "Important", "Later"] as const).map((value) => (
              <Button
                size="small"
                variant={filter === value ? "primary" : "secondary"}
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
        <div className="status-guide" aria-label="Hub status definitions">
          {statusOptions.map((option) => (
            <div key={option.value} title={option.description}>
              <span className={`status-dot status-dot-${option.value}`} aria-hidden="true" />
              <strong>{option.label}</strong>
              <p>{option.description}</p>
            </div>
          ))}
        </div>

        <div className="phase-list">
          {phases.map((phase) => {
            const visibleItems = phase.items.filter((item) => filter === "All" || item.priority === filter);
            if (!visibleItems.length) return null;
            return (
              <section className="phase" id={phase.id} key={phase.id}>
                <div className="phase-heading">
                  <span>{phase.number}</span>
                  <div><h3><b className="phase-emoji" aria-hidden="true">{phase.emoji}</b>{phase.title}</h3><p>{phase.subtitle}</p></div>
                  <strong>{statusDistribution(phase.items)}</strong>
                </div>
                <div className="tasks">
                  {phase.id === "foundation" && (
                    <section className="foundation-summary" aria-labelledby="foundation-summary-title">
                      <div className="foundation-summary-head">
                        <span>Working foundation</span>
                        <h4 id="foundation-summary-title">Who ehllo is for-and the outcome it owns.</h4>
                      </div>
                      <dl>
                        <div><dt>Initial segment</dt><dd>Independent consultants and fractional professionals with frequent external meetings and relationship-driven revenue.</dd></div>
                        <div><dt>Problem</dt><dd>Important meeting context, commitments, and next actions are scattered across memory, notes, inboxes, and calendars.</dd></div>
                        <div><dt>Promise</dt><dd>Remember what mattered in every professional meeting and complete the right follow-up on time.</dd></div>
                        <div><dt>Core job</dt><dd>Capture what mattered and complete the next action before the opportunity goes cold.</dd></div>
                        <div><dt>Primary metric</dt><dd>Captured encounters with a user-reviewed follow-up completed within 72 hours.</dd></div>
                      </dl>
                    </section>
                  )}
                  {phase.id === "discovery" && (
                    <LinkButton className="phase-workspace-link" size="small" href="/hub/discovery">Open discovery workspace <ArrowRightIcon size={15} /></LinkButton>
                  )}
                  {visibleItems.map((item) => (
                    <article className={`task task-${statuses[item.id] ?? getDefaultStatus(item.id)}`} key={item.id}>
                      <span className="status-mark" aria-hidden="true">
                        {(statuses[item.id] ?? getDefaultStatus(item.id)) === "production_ready" && <CheckIcon size={17} />}
                      </span>
                      <div className="task-main">
                        <span className="task-copy">
                        <span className="task-title">{item.title}{item.gate && <b>Gate</b>}</span>
                        <span className="task-detail">{item.detail}</span>
                        </span>
                        <div className="task-controls">
                          <label>
                            <span className="sr-only">Status for {item.title}</span>
                            <select
                              value={statuses[item.id] ?? getDefaultStatus(item.id)}
                              onChange={(event) => updateStatus(item.id, event.target.value as HubStatus)}
                            >
                              {statusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <span className={`priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                        </div>
                        <details className="task-evidence">
                          <summary>Evidence and status guidance</summary>
                          <div>
                            <p>{evidenceById[item.id]?.text ?? "No evidence has been recorded for this item yet."}</p>
                            {evidenceById[item.id]?.link && <a href={evidenceById[item.id]?.link}>Open evidence</a>}
                            <small>Last updated: {evidenceById[item.id]?.lastUpdated ?? "Not updated"}</small>
                            <small>{statusOptions.find((option) => option.value === (statuses[item.id] ?? getDefaultStatus(item.id)))?.description}</small>
                          </div>
                        </details>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="gate-section">
        <span className="hub-kicker">Definition of ready</span>
        <h2>We build the MVP when...</h2>
        <div className="gate-grid">
          <p><strong>01</strong> One segment repeatedly describes the same painful workflow.</p>
          <p><strong>02</strong> At least three pilot users log multiple real meetings for two weeks.</p>
          <p><strong>03</strong> Users complete follow-ups-not merely generate drafts.</p>
          <p><strong>04</strong> At least some pilot users agree to pay for continued use.</p>
        </div>
      </section>

      <footer className="hub-footer">
        <div><span className="hub-brand-mark">A</span><strong>ehllo MVP hub</strong></div>
        <p>Keep the scope narrow. Measure real behavior. Earn every expansion.</p>
        <a href="#checklist">Review checklist <ArrowUpIcon size={15} /></a>
      </footer>
    </main>
  );
}

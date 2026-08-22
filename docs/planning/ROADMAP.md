# ehllo product roadmap

Status: Living delivery backlog
Last updated: 2026-08-02

Delivery source of truth for **implementation order and status**. The canonical product definition-user jobs, information architecture, navigation, screen ownership, and cross-device behaviour-is the [Product Source of Truth](../product/00-product-source-of-truth.md). This roadmap complements the [MVP vertical slice plan](../product/11-mvp-vertical-slice-plan.md) and [MVP.md](./MVP.md).

---

## Two products, one platform

ehllo is split into two product lines. **Most of what ships today is the consumer product.** Some features already exist in code but belong on the **business product** roadmap - we keep them visible here and will refine scope in a later pass.

| | **Consumer product** | **Business product** |
|---|----------------------|----------------------|
| **Who** | Solo professionals, founders, consultants, and **visitors** who scan a card | Small teams and agencies (2–20 people) who need shared records, CRM sync, and outbound |
| **Job to be done** | Share identity, capture people, remember context, follow up in one tap | Activate relationship data across a team - CRM, campaigns, attribution, org cards |
| **Status** | **Current focus** - pilot and polish | **Later** - shown below; detailed planning TBD |
| **Loops** | 01 Share identity · 02 Capture people · 03 Remember context | 04 Activate data (+ team/workspace layer) |
| **Source of truth UX** | **Mobile app** (most up to date) · Consumer section of web | Business section of web only |

Shared platform (auth, cards, encounters, Postgres) serves both. Business features build on consumer foundations; they are not a separate app.

### Web surfaces (split to match mobile)

Mobile defines the consumer loop. Web is **two apps**:

| Build | Base path | Scope |
|-------|-----------|--------|
| **Consumer web** | `/app` | Exact mobile consumer: Home, Card, Connections, Follow-ups, Capture, Scan - **no business** |
| **Business web** | `/business` | Card creation + Contacts CRM · Activate · Outbound - business / not consumer pilot |

Public pages (`/c/[slug]`, `/e/[token]`) stay shared. Agent memory: `.cursor/rules/two-web-builds.mdc` (call out “two web builds”).

Legacy `/app/contacts`, `/app/activate`, `/app/outbound` redirect to `/business/*`.

---

## Product promise (consumer)

**Capture the moment first; contact details sync when someone adds you; AI writes the context from the transcript; follow-up is one tap to call, meet, email, or share a file** - using whatever account they’ve connected.

*(Business product promise - CRM-grade activation for teams - to be defined.)*

---

## Core principle

One continuous loop where **the moment is the source of truth**, and **contact details arrive when someone chooses to connect** - not when you’re mid-conversation trying to remember their email.

---

## User journeys (consumer)

Both paths should feel like **the same product**, not two separate flows.

### Path A - QR first (typical first meeting)

1. You share your QR.
2. They scan → your card opens.
3. They save you / exchange details (“Add me”).
4. That person lands in **People** (their directory and yours when synced).
5. From People they can open your profile or start a **capture** tied to that person.

### Path B - Conversation first (already talking)

1. You start **Capture** before exchanging cards.
2. Transcript drives the context (AI fills notes, summary, follow-up).
3. Later you share QR or they add you.
4. The encounter and the contact **merge into one record**.

---

## What “simple” means (consumer)

| Today (shaky) | Target |
|---------------|--------|
| Email field on the context step | **No email during capture** - it comes from card exchange / save contact |
| Manual title, notes, summary | **AI drafts everything** from transcript; user edits, not types from scratch |
| Generic follow-up types | **Action buttons** that open the right app (call, LinkedIn, Meet, Gmail, Drive, etc.) |
| Contacts and encounters are separate | **One person record** that grows: exchange → capture → follow-up |
| Guest links / data local-only | **True sync** - server-backed encounters, cross-device People |
| Painful email login for visitors | **Light account** after scan (OAuth) → People they’ve met |

---

## Capture flow (consumer target)

| Step | Name | What happens |
|------|------|----------------|
| 1 | **Record** | Consent + audio/transcript (core unchanged) |
| 2 | **Context** | Person first; AI pre-fills from transcript; edit only. No email. Pick/link person from directory if already exchanged. |
| 3 | **Connect** | If not linked: share your card / they saved you / link to inbound exchange. Email, phone, LinkedIn arrive **here**, when details sync. |
| 4 | **Follow-up** | One clear next action, action-oriented (see below). Drop “Another action” for now. |
| 5 | **Review** | Approve private vs shared; share guest link when ready. |

### Follow-up actions (consumer)

| Type | Behaviour |
|------|-----------|
| **Call** | `tel:` when phone on contact |
| **LinkedIn** | Open profile / connect |
| **Schedule meeting** | Google Meet, Zoom, or Microsoft Outlook (connected account) |
| **Send email** | Gmail or Outlook (connected account) |
| **Send draft or file** | Email + attachment; Google Drive or Dropbox by connected provider |

Integrations roll out in phases: deep links first (call, LinkedIn), then calendar (Meet, Zoom, Outlook), then email/files (Gmail, Outlook, Drive, Dropbox).

---

## Auth for the other person (visitor)

- Scan / save contact → optional light account (Google or Microsoft OAuth).
- **People you’ve connected with** - no stressful email magic-link unless they choose it.
- Card exchange is the on-ramp; shared moments link back from People when relevant.

---

## The four loops

### Consumer loops (01–03) - current product

| Loop | Consumer backlog | In app today |
|------|------------------|--------------|
| **01 Share identity** | Wallet + NFC polish, app store links | QR, public link, vCard, email signature, Wallet passes + NFC (env / device dependent) |
| **02 Capture people** | Pilot validation, mobile parity polish | Reciprocal exchange, imports, manual add, inbound queue; badge scan + LinkedIn import on web |
| **03 Remember context** | AI hardening, inbox polish | Consent, capture wizard, server AI extraction, action follow-ups |

### Business loop (04) - later

| Loop | Business backlog | In app today (may move / refocus) |
|------|------------------|-----------------------------------|
| **04 Activate data** | Team workflows, review-first outbound, attribution | HubSpot sync, campaigns, team analytics - **prototype / early code; not consumer pilot scope** |

---

## What’s already aligned (consumer)

- QR / card sharing and public page
- Reciprocal exchange form + inbound captures on Contacts
- Capture wizard (Record → Context → Connect → Follow-up → Review)
- Server AI extraction and action-oriented follow-ups
- Visitor onboarding → People you’ve met
- Google OAuth (owner sign-in)
- Server-backed contacts, encounters, and cards (cross-device)

---

## Consumer product - phases

These phases are the **consumer pilot** scope. Checklist reflects build status; pilot validation (two-phone QR loop, wallet env, etc.) may still be open.

### Phase 1 - Unify person + capture (Loops 02 + 03)

- [x] Remove **email field** from capture context step
- [x] Link **encounter ↔ contact ↔ card exchange** by ID
- [x] **Connect** step in wizard (share card / link exchange / pick from People)
- [x] Path A and Path B both land on the same **Person** record
- [x] Contact detail page: encounters, card link, methods (phone, email, LinkedIn)
- [x] Encounters + guest links **read/write on server** (not localStorage-only)

### Phase 1b - Guest recording & cloud retention

Shared recordings are a **temporary cloud bridge** (3 days). Hosts keep local audio + full transcript; guests get summary, actions, play/download while cloud copy exists.

- [x] Fix guest recording playback (server resolves storage path; no broken audio player)
- [x] Merge cloud recording metadata on encounter save (mobile re-sync no longer wipes uploads)
- [x] Upload recording before save on mobile capture complete
- [x] Mobile **Approve guest view** (`status: shared`) before sharing link
- [x] Guest page: play + **Save to my device** + expiry messaging
- [x] **3-day** cloud retention with daily cleanup cron (`CRON_SECRET` on Vercel)
- [x] Host **email recording** fallback after cloud expiry (mailto with meeting details + device file share)
- [x] Web capture upload path (web hosts upload audio for guest sharing on save + review)
- [x] Mobile capture **Record-only** (import parked for a later build)
- [x] **1-hour** recording auto-stop
- [x] Prefer durable on-device audio (no transcript-only primary path); keep local file after guest upload
- [x] Guest sharing is its own card on review, separate from Follow-up plan; approve uploads local file first when needed
- [x] Guest sharing toggle: turning it on kicks off recording upload in the background with visible progress; Approve is disabled until upload succeeds (no blocking popup)
- [x] Guest-side lightweight follow-up: guest can mark "I'll follow up too" (+ optional note) from the shared link, visible to the host in the Follow-up plan panel

### Phase 2 - Real AI extraction (Loop 03 / Slice 8)

- [x] Server-side AI from transcript / notes (replace client heuristics)
- [x] Auto-fill: private notes, shared summary, follow-up text, suggested channel
- [x] AI runs by default after transcript available - not optional “regenerate” only
- [x] Confidence / uncertainty markers; never overwrite raw transcript
- [x] Regeneration + manual fallback; failed AI leaves usable encounter

### Phase 3 - Action-oriented follow-up (Loop 03 / Slice 9)

- [x] Remove **“Another action”** follow-up type
- [x] Call → `tel:` when number present
- [x] LinkedIn → open profile
- [x] Schedule meeting → Meet / Zoom / Outlook (deep links: Google Calendar + Outlook Calendar)
- [x] Send email / file → Gmail / Outlook + Drive / Dropbox by connected account (deep links)
- [x] Review + Inbox surfaces show **Do it** buttons, not just labels

### Phase 4 - Visitor onboarding (Loop 02)

- [x] Post-scan / post-exchange OAuth (Google, Microsoft)
- [x] **People you’ve met** for visitors without full CRM onboarding
- [x] Low-friction path from public card to signed-in directory

### Phase 5 - Capture people expansion (Loop 02)

- [x] Badge scan flow
- [x] LinkedIn scan / profile URL flow

### Phase 6 - Share identity expansion (Loop 01)

- [x] Apple Wallet pass
- [x] Google Wallet pass
- [x] NFC tap-to-open card

### Phase 7 - Consumer platform (sync + personal accounts)

Personal cross-device persistence and connected accounts for **solo users**. (Team layer moves to business product.)

- [x] **Server-backed contacts** - Postgres source of truth; migrate localStorage; sync on save; hydrate on load
- [x] **Encounters read sync** - list + hydrate encounters from server
- [x] **Card library server hydration** - load/edit cards from server, not localStorage-only
- [x] **Connected accounts** - OAuth for Gmail, Outlook, Google Calendar (personal send/schedule)

---

## Business product - phases (later)

Shown for continuity. **Not consumer pilot scope.** Scope, packaging, and UX will be defined in a dedicated business product pass. Some items already exist in code and may be refactored or gated when we split surfaces.

### Business Phase 1 - Activate data (Loop 04)

- [x] CRM sync (HubSpot private app integration) - *revisit for business packaging*
- [x] Campaigns, attribution, team analytics - *revisit for business packaging*
- [ ] Autonomous outbound only after review-first habit is proven

### Business Phase 2 - Team workspace

- [x] **Team workspaces + team cards** - shared workspace, org templates, member cards - *move behind business tier*
- [ ] CRM-grade team cards (brand lock, admin controls)
- [ ] CRM-grade imports and server-backed directory at org level
- [ ] Team provisioning, roles, and billing (TBD)

### Business Phase 3 - Outbound and ROI (TBD)

- [ ] Review-first campaign sends
- [ ] Event / channel attribution
- [ ] Pipeline and follow-through reporting for teams

*Detailed requirements, pricing, and GTM - discuss when consumer pilot is stable.*

---

## Build order

### Consumer (now)

| Order | Focus | Loops |
|-------|--------|-------|
| **1** | Unify person + capture + server sync | 02, 03 |
| **2** | Real AI extraction | 03 |
| **3** | Action-oriented follow-up | 03 |
| **4** | Visitor onboarding + People you’ve met | 02 |
| **5** | Badge / LinkedIn scan | 02 |
| **6** | Wallet passes + NFC polish | 01 |
| **7** | Consumer platform sync + personal connected accounts | 01, 02, 03 |

### Business (later)

| Order | Focus | Loops |
|-------|--------|-------|
| **B1** | HubSpot / CRM sync (business packaging) | 04 |
| **B2** | Team workspaces + org cards | 04 |
| **B3** | Campaigns, attribution, outbound | 04 |

---

## Current sprint focus (consumer)

**Consumer phases 1–7 (build) largely complete.** Recommended next: **Phase 6 polish** (wallet env, NFC on device, app store links) and **pilot validation** (QR → save → share-back → follow-up on two phones). Business product planning is intentionally deferred.

---

## Known gaps - consumer pilot readiness (found in hands-on testing, 2026-07-30)

Phases above are checked off as "built," but real device testing surfaced gaps the checklist doesn't capture. Tracking here until each is triaged into a phase.

| Gap | What we saw | Why it matters |
|---|---|---|
| ~~**Guest sharing UX is conflated**~~ **RESOLVED 2026-07-30** | Was one linear card with a single button doing double duty (upload + approve) | Fixed: a toggle now enables sharing and starts upload in the background with visible progress; Approve is disabled until upload succeeds |
| ~~**Recording upload has been fragile across multiple sessions**~~ **RESOLVED 2026-08-01** | Hit "Unsupported FormDataPart implementation" and generic upload failures | Upload and transcription APIs now return structured, human-safe error states for auth, size, format, quota, configuration, provider, metadata, and temporary network failures. Web/mobile preserve the local copy, explain recovery, and only show Retry when retrying can help. |
| ~~**Follow-up is one-directional**~~ **RESOLVED 2026-08-01** | Only the recording owner used to set/own follow-up actions | A guest can now create their own structured commitment from the shared record, including the action, channel, and optional due date. The host sees the same commitment details on consumer web, iOS, and Android. Guests cannot edit the host's private plan. |
| ~~**Follow-up channel enum inconsistency (mobile vs web)**~~ **RESOLVED 2026-08-01** | Web and mobile now expose the same 10 canonical channels, including `send` and `other`; mobile supports multi-select and web supports multiple extracted commitments plus an additional manual action | Keep the shared channel vocabulary aligned when adding future action types |
| ~~**Live transcript during recording is off**~~ **RESOLVED 2026-08-01** | Live STT remains deliberately off for reliability | Web and mobile now show audio-level feedback / voice detection while recording without depending on live STT. Transcript appears after Finish. |
| ~~**Transcription provider errors are opaque to the user**~~ **RESOLVED 2026-08-01** | Provider quota/configuration failures previously collapsed into a generic error | Structured capture errors now explain that the recording remains safe and offer retry or manual continuation according to whether the failure is recoverable. |
| **Crash visibility is partially covered** | Capture JavaScript crashes previously only appeared in the developer console | Authenticated capture crashes now report safely to `client_error_reports` without recordings or transcripts. Native hard-crash reporting still requires production Firebase Crashlytics or Sentry credentials before pilot. |
| **Two-phone pilot loop unverified** | Roadmap's own "recommended next" - QR → save → share-back → follow-up hasn't been run end-to-end on two devices this session | Blocking item before pilot, independent of the above |
| **Wallet / NFC on-device validation open** | Per Phase 6, env-dependent; not exercised this session | Same as roadmap note - carried forward, not new |

### Recovery checkpoint - 2026-08-01

- [x] Consumer web production build passes
- [x] Consumer web compiler lint passes
- [x] Mobile TypeScript passes
- [x] Mobile lint has no errors (warnings remain non-blocking)
- [x] 192 contract and regression tests pass
- [x] NFC programming walkthrough is implemented on mobile
- [ ] Validate NFC read/write on supported physical Android hardware
- [ ] Validate the full QR → save → share-back → follow-up loop on two physical phones
- [ ] Record and transcribe a browser clip longer than five minutes

---

## References

- [11-mvp-vertical-slice-plan.md](../product/11-mvp-vertical-slice-plan.md) - Slice 7 Capture, Slice 8 AI Review, Slice 9 Inbox
- [07-end-to-end-product-flow.md](../product/07-end-to-end-product-flow.md) - canonical flows
- [MVP.md](./MVP.md) - MVP scope and exclusions
- [TECHNICAL-PLAN.md](./TECHNICAL-PLAN.md) - stack, AI workflow, expansion path

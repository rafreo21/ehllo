# ehllo Product Source of Truth

**Status:** Canonical  
**Version:** 1.0  
**Adopted:** 2026-08-02  
**Scope:** Consumer mobile (iOS and Android), consumer web, and shared public experiences  
**Excludes:** Business web, except for shared platform contracts

This document defines the product ehllo is building. It is the canonical reference for product jobs, information architecture, navigation, screen ownership, cross-device behaviour, and experience principles.

It describes the **target product**, not a claim that every capability is implemented. Delivery status and sequencing live in the [roadmap](../planning/ROADMAP.md).

## Authority and document hierarchy

When documents conflict, use this order:

1. This Product Source of Truth governs user jobs, information architecture, labels, screen ownership, and experience behaviour.
2. [State machines](./09-state-machines.md) govern valid business-state transitions.
3. [Event dictionary](./10-event-dictionary.md) governs canonical event names and consequences.
4. [MVP Definition of Done](./12-mvp-definition-of-done.md) governs the quality bar.
5. [Roadmap](../planning/ROADMAP.md) governs delivery order and implementation status.
6. [Decision log](./02-decision-log.md) records accepted exceptions and historical decisions.

## Product thesis

ehllo is built around three user jobs:

1. **Share who I am.**
2. **Remember what happened.**
3. **Do what I promised.**

Everything else must support one of these jobs. The interface must not expose internal workflow complexity when the user only needs a clear next action.

The central experience rule is:

> One dominant job per screen.

## Primary product loop

`Share or meet → capture context → identify people → review what mattered → create follow-ups → complete commitments → strengthen the relationship`

The core relationship object is **Person**. An **Encounter** records what happened. A **Follow-up** records what must happen next. A **Card** enables identity sharing and connection.

## Product surfaces

ehllo has three consumer clients on one shared Supabase backend:

- iOS mobile app
- Android mobile app
- Consumer web at `/app`

All three must use the same object identities, persisted data, labels, state transitions, and server events. A change made on one client must appear on the others after synchronization. Platform-specific presentation is allowed; divergent product meaning is not.

Business web at `/business` is a separate product surface and is not governed by consumer navigation.

## Navigation

### Mobile

`Home · People · Capture · Follow-ups · Card`

- Capture is the prominent central action.
- Settings lives behind the avatar/profile control.
- Scan is contextual, not a permanent tab. It appears in Quick Share, Add Person, People, Active Capture, and Card tools.

### Consumer web

`Home · My card · People · Follow-ups · Capture · Settings`

- Capture remains visually pronounced.
- Scan is contextual rather than a sidebar destination.
- Back navigation appears consistently at the top left on subordinate screens.

## Experience architecture

### 1. Home — act now

Home answers only:

- What needs my attention?
- What can I do immediately?

Permanent content is limited to:

- **Today:** overdue and due follow-ups plus captures needing review.
- **Quick Share:** the selected card and a direct Show QR action.
- **Start Capture:** start recording or add quick context.

When a recording is active, Start Capture becomes a compact active-recording state with Return and Pause. Remove journey explainers, promotional cards, permanent metric cards, and duplicated capability descriptions.

### 2. Capture landing — start, resume, or review

The landing screen contains:

- Start recording
- Add quick context
- Active capture, only when recording or paused
- In-progress drafts and captures needing review
- History in the top-right action

The landing is an active-work queue, not an archive. Completed and reviewed captures appear only in History. Search and sort also belong only to History. Empty sections disappear, empty states stay compact, and cloud-sync status is a quiet bottom status rather than feed content.

Only one recording may be active at a time. Starting another recording while one is active opens a recovery sheet that returns the user to the current recording.

### 3. Recording preflight — bottom sheet

Recording begins from a bottom sheet containing:

- Explicit consent confirmation
- Consent method: verbal or written
- Optional people selection
- Current storage destination with Change
- Start recording

Only consent is required. Advanced storage details remain hidden unless requested.

### 4. Live Capture — one focused recording surface

Live Capture prioritizes:

- Visible recording/paused state
- Accurate timer and waveform
- Pause, resume, and finish
- Add, search, or scan people while recording
- Mark an important moment
- Navigation away without stopping or forcing a draft decision
- Recovery after interruption or app closure

The transcript is generated during capture but is not shown as a competing editing surface. It appears in Review, where the user can inspect and correct it. Meeting titles, summaries, due dates, ownership fields, and long storage explanations do not appear during recording.

Android uses a foreground recording service and persistent system notification. iOS uses a background audio session and system-visible recording state. Recording must never become invisible.

### 5. Global mini-recorder

While recording or paused, mobile shows a persistent mini-recorder throughout the app. Tapping it returns to Live Capture.

Consumer web may show an observational state such as “Recording on Raf’s phone,” but must not remotely stop the phone recording in the initial implementation.

### 6. Add People — one reusable bottom sheet

Capture, Review, and manual follow-up creation use the same Add People sheet:

- Search connections
- Recent people
- Enter details
- Scan card

A capture may remain temporarily unassigned. A person is required before participant-specific follow-ups, sharing, or assigning another person a commitment.

### 7. Processing — resilient and transparent

Processing communicates independent stages: recording saved, transcript ready, speakers identified, commitments found, and follow-ups prepared.

Users may leave while work continues. Partial failure is recoverable. A transcription failure must never destroy the recording or capture.

### 8. Review — exception-first approval

Replace the long Context → Connect → Follow-up → Review sequence with one concise review screen containing:

- Who was there and unresolved speakers
- What was agreed
- Suggested follow-ups, owners, channels, and due dates
- Collapsible shared summary
- Collapsible private context
- Collapsible full transcript
- Recording and sharing controls

AI drafts; the user reviews and approves. Nothing is sent automatically.

Follow-ups chosen during processing remain pending — invisible to the follow-up queue, reminders, and notifications — until the user approves the review. Approving the review is a distinct action from choosing to share a guest link: a user can activate their own private follow-ups without ever creating a public recording link.

### 9. Speaker identification

Speaker labels remain stable throughout transcript, summary, and commitments. Unknown speakers are explicit resolution items. Corrections update downstream drafts without rewriting the raw source.

### 10. Capture History

History contains completed captures; the capture landing contains active drafts and items needing review. History supports search and sort in one aligned, sticky control row.

### 11. Follow-ups — operational queue

Follow-ups is the single home for commitments requiring action. Notifications alert users; they do not duplicate the queue.

Group active work by urgency:

- Overdue
- Today
- Upcoming
- Waiting on someone

Completed and dismissed work belongs in History. Rows prioritize person, action, due state, channel, and one primary action. Secondary actions stay behind an overflow menu or detail view.

### 12. Add Follow-up

Manual follow-up creation uses a short flow:

- Person
- Action type
- Due date/reminder
- Optional note or draft
- Save

Templates accelerate common actions without hiding ownership or timing.

### 13. Follow-up Detail and History

Detail shows the source encounter, owner, channel, due state, reminder schedule, draft content, and completion action. History supports search, sort, and reopening only where the state machine permits it.

### 14. People and Person Timeline

People is the relationship directory, not a generic contact database. Search and filters help users find a relationship. A Person page owns identity, encounters, timeline, follow-ups, shared items, and relationship history.

### 15. Card library

The first visit shows an honest empty state. After creation, cards appear as recognizable visual tiles with cover, profile image, label, name, and useful lead detail. Users may create up to five cards.

Each card has a stable public identity and QR code. Editing card content does not replace that QR identity.

### 16. Card detail and Quick Share

Card detail presents the card and its details as they will appear publicly. Tools are grouped into tabs to avoid a long undifferentiated page:

- QR code
- Email signature
- Background
- Watch
- Widgets
- Wallet & NFC

Tabs align left on web. Quick Share makes Show QR and Copy Link immediately available.

### 17. Scan

Scan is launched contextually. A successful scan opens the public card, allows saving to the phone directory, and supports reciprocal detail exchange without requiring an account first.

### 18. Notifications

Notifications are alerts about work, not a second follow-up system.

- A bell in Home (mobile) or the app header (consumer web) opens the notification centre — a chronological list of alerts, distinct from the Follow-ups queue of work to perform.
- Notification records are Supabase-backed (`public.notifications`), shared by iOS, Android, and consumer web, not device-local history.
- Four notification types: transcript/review ready, follow-up due, follow-up overdue, shared meeting update (a guest committing to their own follow-up). Each is an independent, user-configurable preference.
- Follow-up notifications only ever reference a *reviewed* encounter — an unreviewed (draft) encounter never produces a due/overdue/shared-update notification on any channel. See the follow-up gating note under Review.
- Follow-up due dates schedule device reminders when permitted; mobile also keeps a lightweight local echo (AsyncStorage) purely to fire the OS-level banner, but the notification centre itself always reads the shared Supabase records.
- Badges count unresolved (unread) notifications, not every historical event.
- Settings contain one coherent Device Notifications area for permission, timing, per-type toggles, and reminder preferences, shared in shape (not in per-device state) between mobile and web.
- Email reminders remain a separate delivery-channel preference, not a duplicate settings section.
- Remote push delivery is implemented server-side: a dispatcher (`lib/push-dispatch-server.ts`) sends a real Expo push for all four notification types, respecting each per-type preference, recording per-token delivery status/error (no secrets) for debugging, and deactivating a token the moment Expo reports it as unregistered. Every dispatch is best-effort — a failed or unconfigured push never blocks the notification row from being created, and never fails the request that triggered it (an encounter save, the reminder cron, or a guest committing to a follow-up).
- The one remaining gap is obtaining a valid push token to dispatch *to*: that requires an EAS project id, created by running `eas init` against an authenticated Expo account — a one-time step this repo cannot perform on its own (no Expo account access). Until it exists, `registerPushToken()` on each device correctly no-ops rather than claiming success; Settings only ever reports "background alerts are active" when a token was genuinely registered. Local scheduled notifications and the in-app Supabase-backed centre work fully regardless.

### 19. Settings and Connected Accounts

Settings owns profile, authentication, notification preferences, storage preferences, privacy, and connected accounts. Connected Accounts reports provider status and actionable recovery states.

External providers may supply storage or execution, but ehllo remains responsible for clear errors, durable metadata, and safe fallbacks.

### 20. Public shared experiences

The public card is useful without an ehllo account. A shared meeting page contains only the approved shared summary, assigned actions, and an explicitly shared recording.

Recordings shared online are viewable and downloadable for three days, after which the cloud copy expires. Private notes and the full transcript remain private unless deliberately shared.

The guest may acknowledge their commitment and then optionally create an account to retain the relationship history.

## Storage and recording policy

- Local device storage is the default for raw audio.
- Transcript, structured context, and approved follow-ups sync to Supabase.
- Optional online recording sharing lasts three days.
- Google Drive or OneDrive may be selected as user-controlled storage.
- The local file reference is device-specific and must never be presented as available on another device.
- Recording retention, deletion, upload, and expiry states must be explicit and recoverable.

## AI policy

AI owns the middle of the workflow:

`recording/transcript → extraction → summary → commitments → suggested follow-ups → user review`

AI must not silently invent identity, ownership, commitments, or due dates. Raw input is preserved; AI output is disposable; human-approved output becomes permanent.

## Product-quality requirements

Every flow must include:

- Empty, loading/skeleton, success, error, offline, and permission-denied states
- Responsive layouts without unnecessary whitespace
- Consistent spacing, typography, buttons, icons, fields, and cards
- Accessible labels, focus order, touch targets, contrast, and keyboard behaviour
- Optimistic interaction only when safe, with visible recovery when synchronization fails
- Clear cross-device synchronization state
- Bottom sheets for focused mobile choices, confirmations, and recoverable success/error feedback when appropriate—not for every passive message
- No mocked or placeholder logic in a completed feature

## Missing foundations required for the target product

- Durable cross-device recording metadata and synchronization
- Native background recording and interruption recovery
- Reliable transcription and speaker assignment
- Capture draft/review lifecycle shared across clients
- An EAS project id, the one remaining external step before any device can hold a valid push token for the already-built remote-push dispatcher to send to (see Notifications)
- Explicit conflict protection for cross-device edits is implemented for Encounters only; Cards, Contacts, and other user-editable records remain last-write-wins
- Three-day recording-sharing lifecycle and expiry jobs
- Shared component and copy contracts across mobile and consumer web
- Connected storage/provider health and recovery
- Analytics for activation, capture completion, review completion, and follow-up completion

## Delivery sequence

1. **Underlying model:** align shared objects, state transitions, events, and synchronization.
2. **Recording foundation:** native recording, background operation, recovery, local retention, and optional three-day sharing.
3. **Capture UX:** landing, preflight sheet, live capture, mini-recorder, Add People, processing, concise review, and history.
4. **Follow-up core:** urgency-grouped queue, creation, templates, detail, completion, and history.
5. **Reminder system:** permissions, local/push scheduling, badges, notification centre, and unified settings.
6. **Consumer parity:** align iOS, Android, and consumer web data, labels, states, navigation, and responsive presentation.
7. **Simplification:** remove legacy journey cards, duplicate controls, promotional copy, and obsolete routes.
8. **Outcome tracking:** measure captures reviewed and commitments completed, not superficial activity.

## Decision test

Before adding or retaining a screen, component, or setting, ask:

1. Which of the three user jobs does it serve?
2. What is the one dominant action?
3. Is this the correct owner for the information?
4. Does it duplicate another queue, status, or control?
5. Will its meaning remain identical across iOS, Android, and consumer web?

If those questions do not have clear answers, the element does not belong in the primary experience.

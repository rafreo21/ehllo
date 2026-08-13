# ehllo Product Architecture

Status: Working product specification  
Last updated: 2026-07-24

## Product model

ehllo is a relationship operating system for independent professionals.

The product is organised around two complementary objects:

- **Person** is the primary navigation and identity object.
- **Encounter** is the primary activity and evidence object.

A Person gains relationship context over time through linked source objects. The interface assembles those sources into a relationship timeline projection.

## Primary navigation

### Desktop

1. Home
2. People
3. Capture
4. Inbox
5. Card

Settings is accessed through the profile menu.

### Mobile

`Home · People · Capture · Inbox · Card`

Capture is a persistent overlay action. On desktop it opens a modal or command-style surface; on mobile it opens a bottom sheet. It preserves the user's current context. A full-page route exists only as a deep-link, accessibility, recovery, and constrained-browser fallback.

## Domain ownership

### Person

Owns:

- Identity
- Role and company
- Contact methods
- Labels

Person does not own notes, meetings, tasks, relationship state, or timeline history. Those belong to Encounter, Action, Relationship, and Exchange.

### Encounter

Owns:

- Person reference
- Date, time, type, and location
- Original typed or voice notes
- Attachments
- Explicitly captured topics
- Explicitly captured promises
- Raw source references
- Capture and processing state

### Action

Owns:

- Action type
- Person reference
- Optional Encounter reference
- Due date
- Reminder state
- Completion state
- Waiting state
- Follow-up draft or external handoff

### Inbox item

Owns the attention state of work, not the underlying relationship data.

An Inbox item points to:

- An AI review
- An Action
- A reminder
- An overdue promise
- A meeting-preparation prompt

### AI review

Owns proposed structured output until the user accepts, edits, or rejects it:

- Summary
- Extracted facts
- Topics
- Participant promises
- User promises
- Actions
- Reminder
- Follow-up draft
- Relationship insight

No proposed output becomes trusted relationship data until it is reviewed.

### Card

Owns:

- Public professional identity
- Public contact methods
- Sharing link
- QR code
- Exchange preferences

### Exchange

Records:

- A completed identity exchange
- Returned contact details
- Consent state
- Person match or creation
- Source and timestamp

## Major product surfaces

### Home

Purpose: answer “What should I do now?”

Presents:

- Contextual greeting
- Today's Inbox
- Quick Capture
- Recent People
- Upcoming relationship moments
- Share Card

Home does not show generic statistics unless they result in an immediate decision.

### People

Purpose: answer “Who do I know, and what is happening with them?”

Each row contains:

- Name
- Role and company
- Relationship label
- Last encounter
- Next relevant action
- Attention state

Initial filters:

- Needs attention
- Recently met
- Upcoming
- Waiting
- All people

### Person

Purpose: answer “What is the complete state of this relationship?”

Contains:

- Identity and relationship header
- Current next action
- Contact actions
- A chronological relationship timeline projection
- Encounters
- Follow-ups
- Promises
- Notes
- Completed actions
- Upcoming reminders

Primary action: Capture Encounter.

### Capture Encounter

Purpose: answer “What just happened?”

Minimum path:

1. Choose or create a Person
2. Confirm encounter type and time
3. Capture rough context
4. Save

Optional context:

- Location
- Voice note
- Attachments
- Topics
- Commitments
- Next action

Saving must not wait for AI processing.

### AI Review

AI Review is a flow, not a navigation destination.

The interface separates:

- Original material
- Extracted structured information
- Suggested actions
- Suggested communication
- Research or uncertainty warnings

The user can accept, edit, reject, or add missing context. After acceptance, trusted outputs update their owning domain objects. The Person timeline projection then reflects those changes.

### Inbox

Purpose: answer “Which relationships need my attention?”

Sections:

- Needs review
- Due today
- Overdue
- Upcoming
- Waiting
- Completed

Available actions depend on item type:

- Open
- Review
- Approve
- Complete
- Snooze
- Dismiss

### My Card

Purpose: answer “How can someone connect with me?”

Contains:

- Live card preview
- Share QR
- Copy link
- Edit public identity
- Exchange preferences
- Recent exchanges

The public card is account-free and distinct from the owner's private application.

## Timeline projection

Timeline is not a primary domain object. It is assembled from Exchanges, Encounters, approved AI Review outcomes, Actions, Relationship changes, and future Messages.

An implementation may use append-only timeline-event records for performance or auditing, but the source domain objects remain authoritative.

## Supporting flows

- Authentication
- Onboarding
- Public card view
- Return-details exchange
- Person matching
- AI processing and review
- External email handoff
- Settings
- Data export and deletion

## Route intent

Proposed route contract:

- `/app` — Home
- `/app/people` — People
- `/app/people/:personId` — Person
- Global Capture overlay — primary Capture Encounter experience
- `/app/capture` — deep-link, recovery, and full-page fallback
- `/app/inbox` — Inbox
- `/app/card` — My Card
- `/p/:cardSlug` — Public Card
- `/p/:cardSlug/connect` — Return details
- `/app/reviews/:reviewId` — AI Review
- `/app/settings` — Settings

Routes describe user intent. The eventual database identifiers and public slug policy remain implementation decisions.

## Locked architecture decisions

1. Contacts becomes People.
2. Follow-ups becomes Inbox.
3. Person is the primary user-facing relationship object.
4. Encounter is the event and source-evidence object.
5. Capture is globally available.
6. All historical activity appears in the Person timeline projection.
7. AI stays inside the Encounter-to-Action workflow.
8. Inbox is the sole owner of “requires attention.”
9. Settings is not primary mobile navigation.
10. The QR code opens a public card rather than the owner application.
11. No AI output is trusted or sent without user review.
12. The product hub remains frozen unless it blocks shipping.
13. All interpreted information follows Raw → AI → Human → Permanent.
14. User owns membership and preferences; Workspace owns relationship data.
15. AI Review is disposable and versioned.
16. Inbox Item is ephemeral attention state; Action remains durable work.
17. Capture is overlay-first; `/app/capture` is a fallback contract, not the primary journey.
18. State machines and the Event Dictionary are canonical business logic.
19. Delivery proceeds only through independently shippable vertical slices.

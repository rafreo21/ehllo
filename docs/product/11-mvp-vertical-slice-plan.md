# ehllo MVP Vertical Slice Plan

Status: Locked delivery sequence  
Last updated: 2026-07-24

## Delivery rule

Codex builds one complete vertical slice at a time. A slice includes user experience, domain logic, persistence, server behaviour, analytics, failure states, accessibility, responsive layout, and tests. Pages are not considered delivered in isolation.

Every slice must satisfy [MVP Definition of Done](./12-mvp-definition-of-done.md).

## Sprint 1: Foundation

Deliverables:

- Canonical state machines
- Event dictionary
- Vertical-slice plan
- Universal Definition of Done

Exit condition: the four documents agree on object names, state transitions, events, and delivery order.

## Slice 1: Authentication and personal Workspace

### User goal

Create an account, return securely, and reach the private application.

### Path

`Sign up or sign in → Activate User → Create/find personal Workspace → Home`

### Objects

User, Workspace, Workspace membership

### Required events

`UserSignedUp`, `UserActivated`, `WorkspaceCreated`, `WorkspaceMembershipCreated`

### Included

- Combined sign-up/sign-in entry
- Secure session
- Personal Workspace creation
- Protected private routes
- Sign-out
- Returning-user path
- Recovery and expired-link states

### Excluded

Card editing, People, Encounter, AI, Inbox

### Acceptance criteria

- A new User receives exactly one personal Workspace.
- Returning authentication does not create duplicates.
- Unauthenticated access to private routes redirects and preserves destination.
- Invalid or expired authentication is recoverable.
- User reaches an actionable empty Home.

## Slice 2: My Card

### User goal

Create and publish a professional identity within two minutes.

### Path

`Home/onboarding → Edit Card → Preview → Publish → QR and share URL`

### Objects

Card

### Required events

`CardDraftCreated`, `CardUpdated`, `CardPublished`, `CardUnpublished`

### Included

- Required identity fields
- Live preview
- Publish validation
- Public slug
- QR generation
- Copy link
- Unpublish

### Excluded

Returned details, Person creation, analytics dashboard

### Acceptance criteria

- Published Card resolves through an account-free URL.
- Private fields never appear publicly.
- QR opens the public Card, not `/app`.
- Draft survives interruption.
- Publish, unavailable slug, loading, failure, and success states work.

## Slice 3: Public Card

### User goal

View and save another professional's identity without creating an account.

### Path

`Public URL or QR → Public Card → Save/open contact method`

### Objects

Card, privacy-safe Card-view activity

### Required events

`PublicCardViewed`, `QRViewed`

### Included

- Fast public route
- Public profile
- Accessible contact actions
- vCard/contact saving
- Unpublished and unavailable states

### Excluded

Returned recipient details and Person creation

### Acceptance criteria

- No authentication is required.
- Anonymous viewing creates no Person.
- Mobile performance and accessibility budgets pass.
- Unpublished Cards expose no private or stale content.

## Slice 4: QR Exchange

### User goal

Return details to the Card owner and become a known relationship.

### Path

`Public Card → Share details → Consent → Exchange → Person match/create → Relationship`

### Objects

Exchange, Person, Relationship

### Required events

`DetailsReturned`, `ExchangeRecorded`, `PersonCreated`, `PersonMatchedToExchange`, `ExchangeDuplicateFlagged`, `RelationshipCreated`

### Included

- Minimal return-details form
- Consent record
- Immutable Exchange
- Deterministic match
- Duplicate-review path
- Person and Relationship creation

### Excluded

Encounter capture and AI

### Acceptance criteria

- Submission never requires recipient registration.
- Duplicate candidates are never silently merged.
- Original Exchange data remains immutable.
- Owner can reach the resulting Person.
- Failure never clears recipient input.

## Slice 5: People

### User goal

Find a relationship and understand its current state.

### Path

`People → Search/filter → Person row`

### Objects

Person, Relationship, next Action and attention projections

### Required events

Read-model only, plus `PersonIdentityUpdated`, `PersonArchived`, and `PersonRestored` where edited.

### Included

- Search
- Needs attention, Recently met, Upcoming, Waiting, All filters
- Person row with Relationship, next Action, and attention
- Empty and no-results states

### Excluded

Advanced CRM segmentation, bulk campaigns, lead scoring

### Acceptance criteria

- People is not a raw contacts table.
- Filters have explainable definitions.
- Search does not expose other Workspaces.
- Rows lead to a stable Person destination.

## Slice 6: Person and timeline projection

### User goal

Understand the complete history and next step for one relationship.

### Path

`People → Person → Relationship header + projected timeline`

### Objects

Person, Relationship, Exchange, Action projection

### Required events

`RelationshipStageChanged`, `RelationshipHealthChanged`, `RelationshipTouchScheduled`

### Included

- Identity header
- Relationship state
- Next Action
- Exchange and Action history
- Projection source links
- Edit identity and relationship state

### Excluded

Encounter and AI entries until their slices ship

### Acceptance criteria

- Timeline is rebuildable from source objects.
- Raw, reviewed, and completed states are distinguishable.
- Relationship updates are explicit and auditable.

## Slice 7: Capture Encounter

### User goal

Record what just happened without leaving current work.

### Primary experience

`Anywhere → Capture button/shortcut → modal or bottom sheet → Save → dismiss`

`/app/capture` exists only for deep links, accessibility recovery, narrow browser constraints, and interrupted-draft restoration.

### Objects

Encounter, Encounter participants

### Required events

`EncounterDraftCreated`, `EncounterUpdated`, `EncounterSaved`, `EncounterArchived`

### Included

- Overlay-first capture
- Recent Person selection
- Minimal inline Person creation
- Type, time, location
- Typed notes
- Attachment contract
- Recoverable draft
- Timeline projection entry

### Excluded

AI interpretation

### Acceptance criteria

- Minimal capture takes three meaningful actions.
- Opening and dismissing returns the user to original context.
- Save is independent of AI.
- Failure never discards input.
- Deep-link fallback provides equivalent capability.

## Slice 8: AI Review

### User goal

Turn raw Encounter material into accurate, reviewed relationship memory and proposed work.

### Path

`Encounter saved → Generate Review → Needs review → Accept/edit/reject → Permanent effects`

### Objects

Encounter, AI Review, proposed Action, Relationship proposal

### Required events

`AIReviewQueued`, `AIReviewStarted`, `AIReviewGenerated`, `AIReviewGenerationFailed`, `ReviewPartiallyApproved`, `ReviewApproved`, `ReviewRejected`, `AIReviewSuperseded`, `EncounterReviewed`

### Included

- Background generation
- Versioned Review
- Source-versus-proposal presentation
- Per-proposal decisions
- Confidence warnings
- Regeneration
- Manual fallback
- Idempotent approval effects

### Excluded

Autonomous sending

### Acceptance criteria

- Raw Encounter is never overwritten.
- Nothing permanent bypasses human review.
- Failed generation leaves a usable Encounter.
- Regeneration supersedes rather than mutates.
- Approval cannot create duplicate effects.

## Slice 9: Inbox and Action completion

### User goal

See what needs attention and complete the right relationship work.

### Path

`Action/Review condition → Inbox Item → Open/review/snooze/complete → Timeline projection`

### Objects

Action, Inbox Item, AI Review references

### Required events

Action and Inbox events from the Event Dictionary

### Included

- Needs review
- Due today
- Overdue
- Upcoming
- Waiting
- Completed
- Snooze, dismiss, approve, complete
- Home Inbox summary

### Excluded

Unverified autonomous completion

### Acceptance criteria

- Every item explains why it exists.
- Resolving an item preserves the underlying source.
- Dismissed work does not count as completed.
- External email handoff does not infer sending.
- Home and Inbox remain consistent.

## Sprint 4: Product completion

### Slice 10: Polish

- Cross-slice consistency
- Empty, loading, error, offline, and success states
- Responsive and accessibility audits
- Performance budgets

### Slice 11: Notifications

- Notification preferences
- Due and review notifications
- Delivery, retry, and failure handling
- Deep links to originating objects

### Slice 12: Beta readiness

- Security and privacy review
- Export and deletion
- Observability and alerts
- Operational runbooks
- Beta support and feedback
- Critical-path regression coverage

## Sequence rule

A later slice may use the public contract of an earlier slice but must not bypass its state machine. If a later slice exposes a missing foundation, fix the owning slice and its tests rather than duplicating logic.


# ehllo Event Dictionary

Status: Canonical product vocabulary  
Last updated: 2026-07-24

## Event contract

Every event contains:

- `eventId`
- `eventName`
- `eventVersion`
- `occurredAt`
- `actorType`
- `actorId`, where applicable
- `workspaceId`
- `objectType`
- `objectId`
- `correlationId`
- `causationId`, where applicable
- Minimal event-specific payload

Events are facts named in past tense. Commands are requests and are not analytics events. Sensitive note content, transcripts, message bodies, and unnecessary personal data must not be copied into event payloads.

## Actors

- User
- Recipient
- System
- Scheduler
- AI worker
- Verified integration
- Administrator, audited only

## Identity and Workspace events

| Event | What happened | Trigger | Changed object | Downstream reactions |
|---|---|---|---|---|
| `UserSignedUp` | Authentication identity was created | User/auth provider | User | Create personal Workspace |
| `UserActivated` | User became active | User | User | Permit application access |
| `UserSuspended` | Access was suspended | Administrator/system | User | Revoke sessions |
| `UserReinstated` | Suspended access was restored | Administrator | User | Permit new sessions |
| `UserDeleted` | User entered deleted state | User/administrator | User | Revoke sessions; apply retention workflow |
| `WorkspaceCreated` | Personal Workspace was created | System | Workspace | Add owner membership |
| `WorkspaceMembershipCreated` | User joined Workspace | System/user | Membership | Grant authorised access |
| `PersonalWorkspaceProvisioned` | The personal tenancy boundary and owner membership were committed atomically | System | Workspace | Permit onboarding |
| `UserOnboardingCompleted` | Required personal workspace preferences were saved | User | User | Permit normal application entry |

## Card events

| Event | What happened | Trigger | Changed object | Downstream reactions |
|---|---|---|---|---|
| `CardDraftCreated` | Card draft was created | User/system | Card | Show onboarding preview |
| `CardUpdated` | Public Card fields changed | User | Card | Rebuild public revision |
| `CardPublished` | Card became publicly available | User | Card | Activate slug and QR |
| `CardUnpublished` | Public access was disabled | User | Card | Disable public resolution |
| `CardArchived` | Card was retired | User | Card | Remove active sharing entry points |
| `QRViewed` | Public Card was opened through QR | Recipient | Card analytics | Record privacy-safe acquisition event only |
| `PublicCardViewed` | Public Card was opened | Recipient | Card analytics | Record privacy-safe view |

`QRViewed` and `PublicCardViewed` never create a Person or Exchange by themselves.

## Exchange and Person events

| Event | What happened | Trigger | Changed object | Downstream reactions |
|---|---|---|---|---|
| `DetailsReturned` | Recipient submitted details and consent | Recipient | Exchange | Start Person matching |
| `ExchangeRecorded` | Immutable Exchange was created | System | Exchange | Project timeline if Person known |
| `ExchangeDuplicateFlagged` | Multiple Person candidates were found | System | Exchange matching | Create duplicate-review Inbox Item |
| `PersonCreated` | Workspace identity record was created | User/system | Person | Create Relationship |
| `PersonMatchedToExchange` | Exchange was linked to Person | User/system | Exchange matching | Update timeline projection |
| `ExchangeKeptSeparate` | Duplicate candidate was deliberately rejected | User | Exchange matching | Close duplicate-review item |
| `PersonIdentityUpdated` | User-approved identity changed | User | Person | Refresh People and Person projections |
| `PersonArchived` | Person left active lists | User | Person | Hide from default People query |
| `PersonRestored` | Archived Person became active | User | Person | Restore default visibility |
| `PeopleMerged` | Duplicate Person was merged into target | User | People | Re-point references; rebuild projections |
| `PersonDeleted` | Identity was deleted or anonymised | User/system | Person | Apply retention and projection rules |

## Relationship events

| Event | What happened | Trigger | Changed object | Downstream reactions |
|---|---|---|---|---|
| `RelationshipCreated` | Workspace relationship was created | System | Relationship | Make Person operational |
| `RelationshipStageChanged` | User-approved stage changed | User/review approval | Relationship | Update People and timeline projections |
| `RelationshipHealthChanged` | User-approved health changed | User/review approval | Relationship | Recalculate attention queries |
| `RelationshipPaused` | Active relationship was paused | User | Relationship | Suppress nonessential prompts |
| `RelationshipResumed` | Paused relationship resumed | User | Relationship | Restore appropriate prompts |
| `RelationshipClosed` | Relationship was closed | User | Relationship | Resolve future automated prompts |
| `RelationshipReopened` | Closed relationship resumed | User | Relationship | Re-evaluate next touch |
| `RelationshipTouchScheduled` | Next touch was set | User/review approval | Relationship | Create or update Action |

## Encounter and AI events

| Event | What happened | Trigger | Changed object | Downstream reactions |
|---|---|---|---|---|
| `EncounterDraftCreated` | Raw-capture draft started | User | Encounter | Persist recoverable draft |
| `EncounterUpdated` | User changed raw capture | User | Encounter | Invalidate unstarted derived work |
| `EncounterSaved` | Raw Encounter became durable | User | Encounter | Project timeline; optionally queue AI |
| `AIReviewQueued` | Review generation was requested | User/system | Encounter/AI Review | Create AI job |
| `AIReviewStarted` | Worker began generation | AI worker | AI Review | Update processing status |
| `AIReviewGenerated` | Proposed output became ready | AI worker | AI Review | Create Needs-review Inbox Item; notify if allowed |
| `AIReviewGenerationFailed` | Generation failed safely | AI worker/system | AI Review/Encounter | Create retry/manual-review attention |
| `ManualReviewCreated` | User chose structured manual review | User | AI Review | Create Needs-review Inbox Item |
| `ReviewPartiallyApproved` | Some proposals were decided | User | AI Review | Apply only explicitly approved idempotent effects |
| `ReviewApproved` | All material proposals were decided | User | AI Review | Create approved Actions; update reviewed memory and Relationship; resolve review Inbox Item |
| `ReviewRejected` | Review was rejected | User | AI Review | Resolve review Inbox Item; preserve raw Encounter |
| `AIReviewSuperseded` | Review version was replaced | User/system | AI Review | Cancel obsolete work; create new version if requested |
| `EncounterReviewed` | Encounter completed human review | System after decisions | Encounter | Update timeline projection |
| `EncounterArchived` | Encounter left active views | User | Encounter | Preserve history; remove active review prompts |

## Action and Inbox events

| Event | What happened | Trigger | Changed object | Downstream reactions |
|---|---|---|---|---|
| `ActionProposed` | Review proposed durable work | Review approval process | Action | Await approval |
| `ActionApproved` | Proposed Action became active | User | Action | Schedule due checks; create Inbox Item when relevant |
| `ActionBecameDue` | Due window began | Scheduler | Action | Create/activate Due-today Inbox Item |
| `ActionBecameOverdue` | Due time passed | Scheduler | Action | Update priority and Inbox reason |
| `ActionWaiting` | Work waits on another person/date | User | Action | Resolve current item; schedule reactivation |
| `ActionReopened` | Waiting period ended | Scheduler/user | Action | Re-evaluate Inbox visibility |
| `ActionCompleted` | Work was explicitly completed | User/integration | Action | Resolve related Inbox Items; update timeline projection |
| `ActionDismissed` | User decided work was unnecessary | User | Action | Resolve related Inbox Items; exclude from completion metric |
| `ActionCancelled` | Action was invalidated | User/system | Action | Resolve related Inbox Items |
| `InboxItemCreated` | Something began requiring attention | System | Inbox Item | Display in Inbox/Home |
| `InboxItemSnoozed` | Attention was deferred | User | Inbox Item | Schedule reactivation |
| `InboxItemReactivated` | Snooze period ended | Scheduler | Inbox Item | Return to active Inbox |
| `InboxItemResolved` | Required decision was satisfied | User/system | Inbox Item | Remove from active Inbox |
| `InboxItemDismissed` | User dismissed attention | User | Inbox Item | Remove from active Inbox |
| `InboxItemExpired` | Attention was no longer relevant | Scheduler/system | Inbox Item | Remove from active Inbox |
| `ReminderSnoozed` | Reminder Action and item were deferred | User | Action/Inbox Item | Emit `ActionWaiting` and `InboxItemSnoozed` in one transaction |

## Notification and communication events

| Event | What happened | Trigger | Changed object | Downstream reactions |
|---|---|---|---|---|
| `FollowUpDraftApproved` | User approved draft content and recipient | User | Action | Permit external handoff |
| `ExternalSendOpened` | External composer was opened | User | Action activity | Do not mark complete |
| `FollowUpConfirmedSent` | User or verified integration confirmed sending | User/integration | Action | Complete Action; update timeline |
| `NotificationScheduled` | Eligible notification was scheduled | System | Notification job | Deliver at configured time |
| `NotificationDelivered` | Provider accepted delivery | Provider/system | Notification job | Record delivery status |
| `NotificationFailed` | Delivery failed | Provider/system | Notification job | Retry or create operational alert |

## Event chaining examples

### First sign-up

```text
UserSignedUp
→ WorkspaceCreated
→ WorkspaceMembershipCreated
→ CardDraftCreated
```

### Returned QR details

```text
QRViewed
→ DetailsReturned
→ ExchangeRecorded
→ PersonCreated or ExchangeDuplicateFlagged
→ PersonMatchedToExchange
→ RelationshipCreated
```

### Encounter review

```text
EncounterSaved
→ AIReviewQueued
→ AIReviewStarted
→ AIReviewGenerated
→ InboxItemCreated
→ ReviewApproved
→ ActionProposed
→ ActionApproved
→ EncounterReviewed
→ InboxItemResolved
```

### Due Action

```text
ActionBecameDue
→ InboxItemCreated
→ NotificationScheduled
→ ActionCompleted
→ InboxItemResolved
```

## Analytics usage

Product analytics consumes selected domain events rather than inventing separate names. Analytics properties use coarse, non-sensitive classifications. Funnel calculations must preserve distinctions between proposed, approved, dismissed, and completed work.

## Versioning

- Event names are stable.
- Additive payload changes do not change the version.
- Breaking semantic or payload changes increment `eventVersion`.
- Consumers ignore unknown additive fields.
- Deprecated event versions remain readable for the agreed retention period.

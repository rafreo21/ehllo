# ehllo Canonical State Machines

Status: Canonical business-logic specification  
Last updated: 2026-07-24

## Rules

- State changes occur only through the commands listed here.
- Every accepted transition emits its named domain event.
- Invalid transitions return a typed business error and make no changes.
- Transition checks are enforced server-side; the interface also prevents invalid controls.
- Historical records are never moved backwards to recreate an earlier state.
- Administrative repair operations, privacy deletion, and legal retention actions are separate audited processes.

## User

| Current | Command | Next | Event |
|---|---|---|---|
| Invited | Accept invitation | Active | `UserActivated` |
| Active | Suspend | Suspended | `UserSuspended` |
| Suspended | Reinstate | Active | `UserReinstated` |
| Invited | Delete | Deleted | `UserDeleted` |
| Active | Delete | Deleted | `UserDeleted` |
| Suspended | Delete | Deleted | `UserDeleted` |

Terminal: Deleted.

Invalid examples: Deleted → Active; Active → Invited.

## Card

| Current | Command | Next | Event |
|---|---|---|---|
| Draft | Publish | Published | `CardPublished` |
| Published | Update public fields | Published | `CardUpdated` |
| Published | Unpublish | Unpublished | `CardUnpublished` |
| Unpublished | Republish | Published | `CardPublished` |
| Draft | Archive | Archived | `CardArchived` |
| Unpublished | Archive | Archived | `CardArchived` |

Terminal: Archived.

Guards:

- Publish requires all required public fields and an available public slug.
- A published Card update creates a new public revision.

Invalid examples: Archived → Draft; Draft → Unpublished.

## Exchange

Exchange occurrence is immutable. Matching is a separate state.

| Current matching state | Command | Next | Event |
|---|---|---|---|
| Unmatched | Match Person | Matched | `PersonMatchedToExchange` |
| Unmatched | Flag candidates | Possible duplicate | `ExchangeDuplicateFlagged` |
| Possible duplicate | Match Person | Matched | `PersonMatchedToExchange` |
| Possible duplicate | Keep separate | Intentionally separate | `ExchangeKeptSeparate` |
| Intentionally separate | Explicitly match | Matched | `PersonMatchedToExchange` |

Terminal: Matched for automatic processing. A deliberate audited rematch operation may change the referenced Person without rewriting Exchange history.

Invalid examples: Matched → Unmatched; changing occurrence time or original returned details.

## Person

Person lifecycle governs availability, not mutable identity fields.

| Current | Command | Next | Event |
|---|---|---|---|
| Active | Archive | Archived | `PersonArchived` |
| Archived | Restore | Active | `PersonRestored` |
| Active | Merge into target | Merged | `PeopleMerged` |
| Archived | Merge into target | Merged | `PeopleMerged` |
| Active | Privacy delete/anonymise | Deleted | `PersonDeleted` |
| Archived | Privacy delete/anonymise | Deleted | `PersonDeleted` |

Terminal: Merged, Deleted.

Guards:

- Merge requires a different active target Person in the same Workspace.
- Merge re-points linked records through an audited operation.
- Identity edits emit `PersonIdentityUpdated` without changing lifecycle state.

Invalid examples: Merged → Active; Deleted → Archived.

## Relationship

Lifecycle status and relationship stage are separate.

### Lifecycle

| Current | Command | Next | Event |
|---|---|---|---|
| Active | Pause | Paused | `RelationshipPaused` |
| Paused | Resume | Active | `RelationshipResumed` |
| Active | Close | Closed | `RelationshipClosed` |
| Paused | Close | Closed | `RelationshipClosed` |
| Closed | Reopen | Active | `RelationshipReopened` |

### Stage change

Any non-deleted Relationship may move between configured stages through `Change relationship stage`, emitting `RelationshipStageChanged`. AI can only propose this command; a User approves it.

### Health change

Health may change through explicit User input or approved Review output, emitting `RelationshipHealthChanged`.

Guards:

- Only one active or paused Relationship exists per Workspace–Person pair.
- Stage and health changes require a reason/source.

## Encounter

| Current | Command | Next | Event |
|---|---|---|---|
| Draft | Save | Saved | `EncounterSaved` |
| Saved | Queue AI | Processing | `AIReviewQueued` |
| Saved | Edit raw capture | Saved | `EncounterUpdated` |
| Saved | Archive | Archived | `EncounterArchived` |
| Processing | Complete AI generation | Review ready | `AIReviewGenerated` |
| Processing | Fail AI generation | Processing failed | `AIReviewGenerationFailed` |
| Processing failed | Retry AI | Processing | `AIReviewQueued` |
| Processing failed | Continue manually | Review ready | `ManualReviewCreated` |
| Review ready | Approve or reject Review | Reviewed | `EncounterReviewed` |
| Review ready | Regenerate | Processing | `AIReviewQueued` |
| Reviewed | Archive | Archived | `EncounterArchived` |

Terminal: Archived.

Guards:

- Saving requires a Workspace, creator, occurrence time, and at least one Person or recoverable unmatched identity.
- Queue AI requires a Saved Encounter version.
- Review completion requires every material proposal to be accepted, edited, or rejected.
- Raw material remains immutable by AI.

Invalid examples: Archived → Draft; Reviewed → Processing; Processing → Draft.

## AI Review

| Current | Command | Next | Event |
|---|---|---|---|
| Queued | Start generation | Processing | `AIReviewStarted` |
| Queued | Cancel | Superseded | `AIReviewSuperseded` |
| Processing | Generation succeeds | Ready | `AIReviewGenerated` |
| Processing | Generation fails | Failed | `AIReviewGenerationFailed` |
| Failed | Retry as new version | Superseded | `AIReviewSuperseded` |
| Ready | Approve some proposals | Partially approved | `ReviewPartiallyApproved` |
| Ready | Approve all decisions | Approved | `ReviewApproved` |
| Ready | Reject | Rejected | `ReviewRejected` |
| Ready | Regenerate | Superseded | `AIReviewSuperseded` |
| Partially approved | Complete remaining decisions | Approved | `ReviewApproved` |
| Partially approved | Reject remaining proposals | Approved | `ReviewApproved` |
| Partially approved | Regenerate remaining work | Superseded | `AIReviewSuperseded` |

Terminal: Approved, Rejected, Superseded.

Guards:

- Retrying or regenerating creates a new Queued Review version.
- Only Ready or Partially approved Reviews may create approved effects.
- Approved effects are idempotent.

Invalid examples: Approved → Processing; Rejected → Ready; Superseded → Approved.

## Action

| Current | Command | Next | Event |
|---|---|---|---|
| Proposed | Approve | Open | `ActionApproved` |
| Proposed | Reject | Dismissed | `ActionDismissed` |
| Open | Reach due window | Due | `ActionBecameDue` |
| Open | Wait | Waiting | `ActionWaiting` |
| Open | Complete | Completed | `ActionCompleted` |
| Open | Dismiss | Dismissed | `ActionDismissed` |
| Open | Cancel | Cancelled | `ActionCancelled` |
| Due | Due time passes | Overdue | `ActionBecameOverdue` |
| Due | Wait | Waiting | `ActionWaiting` |
| Due | Complete | Completed | `ActionCompleted` |
| Due | Dismiss | Dismissed | `ActionDismissed` |
| Overdue | Wait | Waiting | `ActionWaiting` |
| Overdue | Complete | Completed | `ActionCompleted` |
| Overdue | Dismiss | Dismissed | `ActionDismissed` |
| Waiting | Waiting period ends | Open | `ActionReopened` |
| Waiting | Complete | Completed | `ActionCompleted` |
| Waiting | Cancel | Cancelled | `ActionCancelled` |

Terminal: Completed, Dismissed, Cancelled.

Guards:

- Proposed Actions are invisible as commitments until approved.
- Completion is explicit or comes from a verified integration event.
- Dismissal requires an optional reason and never counts as completion.

Invalid examples: Completed → Open; Dismissed → Due; Cancelled → Proposed.

## Inbox Item

| Current | Command | Next | Event |
|---|---|---|---|
| Active | Snooze | Snoozed | `InboxItemSnoozed` |
| Active | Resolve | Resolved | `InboxItemResolved` |
| Active | Dismiss | Dismissed | `InboxItemDismissed` |
| Active | Expire | Expired | `InboxItemExpired` |
| Snoozed | Snooze period ends | Active | `InboxItemReactivated` |
| Snoozed | Resolve through source | Resolved | `InboxItemResolved` |
| Snoozed | Dismiss | Dismissed | `InboxItemDismissed` |
| Snoozed | Expire | Expired | `InboxItemExpired` |

Terminal: Resolved, Dismissed, Expired.

Guards:

- Resolve requires the referenced decision or source condition to be satisfied.
- Resolving does not delete the underlying Action, Review, Person, or Encounter.
- Only Active items appear in the primary Inbox.

Invalid examples: Resolved → Active; Dismissed → Snoozed; Expired → Active.

## Cross-object transaction rules

- `ReviewApproved` and its approved effects commit atomically or retry idempotently.
- `PeopleMerged` re-points relationships, encounters, actions, exchanges, and inbox references atomically.
- `ActionCompleted` resolves active Inbox Items that exist solely because that Action required attention.
- `PersonDeleted` or anonymised records retain lawful referential integrity without exposing deleted identity.
- Event publication uses an outbox or equivalent transactional mechanism so state and events cannot diverge.


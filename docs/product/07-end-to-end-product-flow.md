# ehllo End-to-End Product Flow

Status: Working experience specification  
Last updated: 2026-07-24

## Experience objective

The first-use experience should reach “My card is ready” within two minutes. The repeated-use experience should help the user capture an Encounter quickly, review organised context, complete the right follow-up, and return the next day to a useful Inbox.

## Journey state model

### Account state

- Anonymous
- Authenticating
- New account
- Onboarding incomplete
- Active
- Signed out
- Recovery required

### Card state

- Not created
- Draft
- Ready to publish
- Published
- Temporarily unavailable

### Exchange state

- Card viewed
- Details not returned
- Details submitted
- Match required
- Person created
- Existing Person matched
- Duplicate unresolved

### Encounter state

- Draft
- Saved
- Processing
- Review ready
- Processing failed
- Reviewed
- Archived

### Action and Inbox state

- Needs review
- Due today
- Upcoming
- Overdue
- Waiting
- Completed
- Dismissed

## Flow 1: Sign-up to “My card is ready”

### Entry

The user arrives from the product site, an invitation, or a direct authentication link.

### Main path

1. User chooses email or an available identity provider.
2. Authentication succeeds.
3. ehllo determines this is a new account.
4. User enters:
   - Name
   - Role
   - Company, optional
   - Profile photo, optional
   - Primary contact method
5. A live card preview updates while the user types.
6. User selects “Publish my card.”
7. ehllo validates required public fields.
8. A public slug and QR code are created.
9. Confirmation appears: “Your card is ready.”
10. User lands on Home.

### Home after first publish

The page prioritises:

1. Share your card
2. Capture an encounter
3. Preview your public card

### Branches

#### Existing account

Authentication routes directly to Home and preserves the intended destination.

#### User postpones profile photo

Publishing remains available with initials or a neutral fallback.

#### Required detail missing

The user remains on the relevant field with a specific inline error. Completed fields are preserved.

#### Public slug conflict

ehllo proposes an available slug without losing entered information.

#### Publish failure

The card remains a local or server-side draft. The user sees a retry action and can leave without re-entering details.

## Flow 2: Share or scan to Person creation

### Main path

1. Owner opens My Card or the Home share action.
2. Owner displays the QR code.
3. Recipient scans it.
4. Recipient lands on the public card without an account.
5. Recipient can:
   - Save contact details
   - Open an available contact method
   - Return their details
6. Recipient selects “Share your details.”
7. Recipient enters the minimum necessary information.
8. Recipient confirms consent and submits.
9. ehllo attempts to match an existing Person.
10. A new Person is created or an existing Person is linked.
11. The Person timeline projection displays the Exchange.
12. Owner receives an Inbox item or subtle Home notification.

### Recipient success state

The recipient sees:

- Confirmation that details were shared
- The owner's identity
- A clear way to save the owner's contact
- No request to create an account

### Branches

#### Recipient only views or saves

The owner does not receive invented Person data. Anonymous aggregate analytics may be considered later.

#### Existing Person match

The Exchange attaches to the existing Person.

#### Possible duplicate

The owner receives a review item with merge, keep separate, and dismiss options.

#### Recipient submits incomplete or invalid data

Inline validation explains what is needed without clearing the form.

#### Network failure

The recipient's entered details remain visible and can be resubmitted.

## Flow 3: Capture an Encounter

### Entry points

- Persistent Capture action
- Person page
- Home Quick Capture
- Exchange notification
- Inbox suggestion

### Minimum three-action path

1. Open Capture.
2. Select a recent Person.
3. Add rough context and save.

Recent Person, current time, and the most likely encounter type can be preselected where safe.

### Full path

1. Choose or create Person.
2. Confirm:
   - Encounter type
   - Date and time
   - Location, optional
3. Add:
   - Typed notes
   - Voice note
   - Attachments
   - Explicit promises or next action
4. Select “Save encounter.”
5. The Person timeline projection immediately displays the saved Encounter.
6. AI processing starts asynchronously.
7. User may return to Home or the Person page.

### Branches

#### Unknown Person

The user creates a minimal Person inline and continues capture without entering a full profile.

#### Capture started from Person

The Person is already selected.

#### User has almost no time

Name plus a short note is sufficient. The Encounter can be completed later.

#### Offline or unstable connection

The draft remains on the device, is visibly marked unsynced, and retries when possible. Exact offline implementation is deferred to engineering design.

#### Save fails

No entered material is discarded. The interface offers retry and copy-to-clipboard recovery.

## Flow 4: AI processing and review

### Main path

1. Saved Encounter enters Processing.
2. AI receives only the authorised Encounter material.
3. Structured output is produced:
   - Summary
   - Topics
   - Facts
   - Participant promises
   - User promises
   - Suggested actions
   - Reminder
   - Follow-up draft
   - Relationship insight
4. Encounter becomes Review ready.
5. A Needs review item appears in Inbox.
6. User opens AI Review.
7. Original source material remains visible.
8. User accepts, edits, or rejects each material output.
9. User confirms the review.
10. Accepted facts and summary become reviewed Encounter and Relationship memory; the Person timeline projection reflects them.
11. Accepted commitments become Actions.
12. Approved reminder becomes an upcoming Inbox item.
13. The follow-up draft remains unsent until separately approved.

### Branches

#### Low-confidence extraction

The affected field is clearly marked and requires explicit confirmation.

#### Processing failure

The original Encounter remains safe. Inbox shows Retry processing and Review manually.

#### User rejects all output

The Encounter remains valid with its original notes. No Actions are created.

#### User edits output

The edited version becomes trusted data; the original AI proposal may be retained in an audit record but is not shown as current truth.

## Flow 5: Follow-up approval and completion

### Main path

1. Review produces a suggested follow-up Action.
2. Inbox places it in Needs review or Due today.
3. User opens the item.
4. The interface shows:
   - Person
   - Encounter context
   - Commitments
   - Editable draft
   - Intended recipient and channel
5. User edits or approves.
6. ehllo opens an external email handoff or uses a future authorised delivery service.
7. User confirms the message was sent.
8. Action becomes Completed.
9. The completed Action becomes a source event shown by the Person timeline projection.

### Branches

#### User is not ready

The Action can be scheduled, snoozed, or placed in Waiting.

#### No follow-up is appropriate

The user dismisses it with an optional reason. Dismissal does not count as completion.

#### Recipient or channel is missing

The item explains what is missing and links to the Person details.

#### Send handoff is abandoned

ehllo does not infer completion. The Action remains open until the user confirms.

## Flow 6: Second-day return

### Entry

The user opens ehllo the next morning or follows a reminder.

### Home priority

1. Today’s Inbox count
2. Needs review
3. Due today
4. Overdue
5. Upcoming relationship moments
6. Recent People
7. Quick Capture
8. Share Card

### Example

“Good morning, Raf”

- Review Sarah’s Encounter
- Follow up with James
- Coffee with Michael tomorrow

### Main path

1. User opens the highest-priority item.
2. User reviews, approves, completes, snoozes, or dismisses it.
3. Inbox updates immediately.
4. Home reflects the remaining work.
5. The Person timeline projection reflects meaningful state changes from their owning objects.

## Flow 7: Person relationship timeline projection

### Timeline event types

- Exchange
- Encounter
- AI review completed
- Promise created
- Action due
- Follow-up completed
- Reminder scheduled
- Note added
- Attachment added
- Person details changed

### Timeline principles

- Chronological by default
- Important upcoming items can be pinned above history
- Every event makes its source and status clear
- AI proposals are visually distinct from reviewed facts
- Private notes never appear on the public card

## Global attention rules

Inbox is the only system that owns attention.

- **Needs review:** human judgement is required.
- **Due today:** an accepted Action is due now.
- **Overdue:** the due time has passed without completion or dismissal.
- **Upcoming:** an accepted Action has a future due time.
- **Waiting:** the next move belongs to someone else or a chosen date.
- **Completed:** the user explicitly confirmed completion.
- **Dismissed:** the user deliberately decided no action was required.

No background system may mark an Action completed solely because an external application was opened.

## Global recovery rules

1. Never discard user-entered notes after a failed save.
2. Never block Encounter creation on AI availability.
3. Never send AI-generated communication without user approval.
4. Never create a Person from anonymous card viewing alone.
5. Never silently merge possible duplicate People.
6. Always show whether data is draft, processing, proposed, reviewed, synced, or failed.
7. Preserve the user's intended destination across authentication.

## Experience targets

- New user reaches published-card confirmation within two minutes.
- Returning user starts a minimal Encounter in one action.
- Minimal capture completes in three meaningful actions.
- Saved Encounter appears immediately without waiting for AI.
- AI review clearly separates source, proposal, and trusted result.
- Inbox always explains why an item requires attention.
- Public-card recipients never need an ehllo account.

## Implementation order implied by the flow

1. Authentication and onboarding shell
2. Public Card and QR exchange
3. Person and Exchange creation
4. Encounter capture and Person timeline projection
5. AI processing and Review
6. Actions and Inbox
7. Reminder delivery and repeated daily use

Each increment must complete a usable vertical path and leave the underlying object ownership intact.

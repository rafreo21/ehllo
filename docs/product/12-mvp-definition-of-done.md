# ehllo MVP Definition of Done

Status: Required quality bar  
Last updated: 2026-07-24

A feature or vertical slice is complete only when every applicable item below is satisfied. “The screen exists” is never sufficient.

## User outcome

- The intended user goal is achieved end-to-end.
- The flow begins from a real entry point and ends in a meaningful, confirmed state.
- Acceptance criteria are demonstrably met.
- The experience uses the canonical objects, states, transitions, and events.
- No critical step relies on instruction text to compensate for a broken interaction.

## Integrated product

- UI, server behaviour, domain logic, and persistence work together.
- Authorisation is enforced server-side.
- State transitions reject invalid commands.
- Cross-object effects are atomic or safely idempotent.
- Refreshing or returning preserves committed state.
- No placeholder, sample-only, or mocked business logic remains on the shipped path.

## Interaction states

- Empty state exists.
- Loading or processing state exists.
- Validation state exists.
- Recoverable error state exists.
- Success or completion state exists.
- Permission-denied and unavailable states exist where applicable.
- Destructive actions require clear confirmation.
- User input survives recoverable failures.

## Human-review safety

- Raw source material is preserved.
- AI proposals are visually and structurally distinct from trusted information.
- AI never silently edits Person or Relationship.
- AI never creates an active Action without approval.
- AI never sends communication without approval.
- Regeneration is versioned.

## Accessibility

- Semantic structure and native controls are used where practical.
- Every control has an accessible name.
- Complete flow is keyboard operable.
- Focus order and visible focus are correct.
- Modal or sheet focus is trapped and restored correctly.
- Errors are programmatically associated with fields.
- Colour is not the only status indicator.
- Contrast meets WCAG AA basics.
- Motion respects reduced-motion preferences.

## Responsive experience

- Mobile and desktop layouts both work.
- Touch targets are appropriately sized.
- Important actions remain reachable with the on-screen keyboard open.
- Content does not require unintended horizontal scrolling.
- Overlay experiences have a full-page fallback where required.

## Events and analytics

- Required domain events are emitted once with the correct version and actor.
- Event publication cannot diverge from committed state.
- Analytics uses approved domain events or documented derived metrics.
- No sensitive notes, transcripts, message bodies, or unnecessary personal data enter analytics.
- Success, dismissal, abandonment, and failure remain distinguishable.

## Privacy and security

- Data is scoped to the correct Workspace.
- Public and private fields are explicitly separated.
- Inputs are validated and outputs safely encoded.
- Secrets and credentials never enter client code or logs.
- Consent and retention requirements are implemented where relevant.
- Export, deletion, and audit consequences are understood.
- Abuse and rate-limit requirements are covered for public surfaces.

## Performance and reliability

- User actions receive immediate feedback.
- Slow background work does not block durable capture.
- Retry behaviour is bounded and idempotent.
- Public-card performance meets the agreed mobile budget.
- No known critical console or server errors remain.
- Operationally meaningful failures are observable.

## Testing

- Domain transition tests cover every valid transition and representative invalid transitions.
- Event tests verify names, versions, actors, objects, and idempotency.
- Persistence tests verify creation, reload, and isolation.
- Authorisation tests cover cross-Workspace access.
- Critical user path has integration coverage.
- Important responsive and accessibility behaviour is verified.
- Production build passes.
- Changed files pass lint and type checking, or a proven pre-existing blocker is reported separately.

## Product review

- Copy uses final product terminology.
- No Contacts legacy terminology remains where People is intended. Follow-ups is the correct consumer name for that surface (DEC-034); Inbox Item remains an internal state-machine object only.
- No dead links or unreachable states remain.
- The implementation matches the current product specification.
- Any independent architecture decision is added to the decision log.
- Known limitations are explicit and do not invalidate the user goal.

## Required completion report

Every slice handoff states:

- User goal delivered
- Entry and completion points
- Objects and transitions implemented
- Events emitted
- Persistence and migration changes
- Files changed
- Tests and commands run
- Results
- Accessibility and responsive checks
- Known limitations
- Deferred work

## Release decision

A slice is **Done** only when:

1. Every blocking item above passes.
2. The full path works with production configuration.
3. No mocked logic remains in that path.
4. The product owner can reproduce the outcome.

Anything less is Prototype, In progress, or Blocked—not Done.


# Events: attendance record, reversal, and calendar sync

Status: Proposed — not yet accepted into the Product Source of Truth
Raised: 2026-08-17
Scope: Consumer mobile and consumer web Events surface

## The problem, stated plainly

Declining an event today makes it **disappear completely**.

`bucketEvents` in `mobile/src/features/events/event-home-state.ts` only ever
buckets events the user is **going** to. A `not_going` record is written to
`public.event_attendance`, and `candidateSuppressionKey` in `lib/events.ts`
then uses it to stop the calendar importer re-suggesting that entry — but
nothing in the interface ever shows the decision back to the user.

So the user made a decision, the product remembered it, and then gave them no
way to see or change it. Two consequences follow:

1. **The record is not straight.** "I said no to that" is a fact about the
   user's week that the product holds and hides.
2. **Changing your mind is impossible.** There is no row to tap. Worse, the
   suppression key is organizer + title + time-of-day, so declining one
   instance quietly suppresses future look-alike entries — an invisible,
   irreversible side effect of a single tap.

This is the actual defect. "Not-going events should be in Past" is the
user-facing symptom of it.

## Principle

Two independent axes are being collapsed into one:

- **Time** — has the event ended? (`isUpcomingEvent` compares `ends_at`, not
  `starts_at`, which is correct and must stay: an in-progress event is still
  upcoming until it finishes.)
- **Intent** — going, not going, or undecided.

`Upcoming` is *going × future*. Everything else with a recorded decision has
nowhere to live. The fix is not to redefine "past" as "not on my plate", but to
give the second tab honest internal structure so it can hold both without
lying about which is which.

## Taxonomy

**Upcoming** — `going`, not yet ended. Unchanged.

**Past** — three groups, in this order:

| Group | Contents | Why it is here |
|---|---|---|
| **Not going** | `not_going`, not yet ended | The reversible one. This is what the user is looking for. |
| **Attended** | ended, `going` | Carries captures and follow-ups. |
| **Didn't attend** | ended, `not_going` | Completes the record. Collapsed by default. |

Cancelled events (`events.status = 'cancelled'`) leave Upcoming regardless of
attendance and appear under Past with a `Cancelled` label — a cancelled event
sitting in Upcoming is its own version of an untrue record.

Group headers carry counts; empty groups disappear entirely rather than
rendering an empty state, per the Product Source of Truth's rule that the
landing surface is an active-work queue.

## Tap behaviour — one sheet, three shapes

Every Past row opens the same bottom sheet component. What it offers is
determined by **time**, not by the group label, so the behaviour is never
surprising:

### Not going, still in the future

> **Connect X Ignite** · Thu 4 Sep, 09:00
> You said you're not going.

- **I'm going after all** (primary) — sets `going`, clears the suppression, row
  animates out of Past and into Upcoming.
- **Remove from my events** — secondary, destructive styling.
- Dismiss to leave unchanged.

This is the "I changed my mind" path, and it is the only one that needs to feel
fast: one tap, no confirmation, no navigation.

### Ended (attended or not)

> **Connect X Ignite** · finished 12 Aug

- **View captures & follow-ups** (primary, only when the event has any).
- **Create a new event from this** — opens the existing create flow prefilled
  with title and location, **dates deliberately cleared**.
- **Remove from my events**.

Recreating rather than "re-attending" is right: an event that has finished is a
historical fact, and editing its date would silently rewrite history that
captures and follow-ups are already attached to. A new row keeps both truthful.

This also gives the malformed-link case a blessed path. The current
"Confirm event" sheet warns *"This link contains a past event date. Choose the
current event's correct start date and time before adding it."* and then leaves
`STARTS` as `Not set` — which is the recreate flow, arrived at by accident. It
should be the same flow, reached deliberately.

## Logic that must not be missed

1. **Un-suppression is part of the flip.** Setting `going` has to lift the
   `candidateSuppressionKey` entry, or the importer keeps hiding that recurring
   entry even though the user just said yes. Verify the suppression lookup is
   derived from live `not_going` rows (in which case it lifts for free) rather
   than a materialised list.
2. **Conflict protection.** DEC-031 requires optimistic concurrency on event
   and attendance updates. The sheet's action carries the revision it was drawn
   from; a stale flip reloads rather than overwrites.
3. **Offline.** `event_action_queue` already carries `attendanceStatus`, so the
   flip enqueues and replays. The row must show its pending state rather than
   silently reverting.
4. **Time, not dates.** The upcoming/past split stays an absolute `ends_at`
   comparison. Device-local day boundaries are for *labels* ("Today",
   "Tomorrow") only. Never compare date-only strings.
5. **Removal ≠ declining.** "Remove from my events" deletes the relationship,
   not the event. If it came from the calendar it will legitimately return as a
   candidate; that is correct, and different from `not_going`.

## Calendar sync, both directions

Today: Google → ehllo only. `source in ('manual','link','calendar')`, and
`events_workspace_external_uidx` already enforces one row per
`(workspace_id, external_id)`.

The good news is the two hard parts are already solved:

- **Scope.** `lib/integrations/types.ts` already requests
  `https://www.googleapis.com/auth/calendar.events`, which is read **and**
  write. No re-consent for existing users.
- **Loop prevention.** The importer already dedupes on `external_id`. An event
  ehllo pushes comes back carrying the id ehllo stored, so it matches and
  updates instead of duplicating. This is the property that usually sinks
  two-way sync, and it exists.

What is still needed:

- A `sync_state` (`none` / `pending` / `synced` / `failed`) and `synced_at` on
  `events`, so the UI can be honest about whether a push landed. Reuse the
  outbox retry shape from `event_email_outbox` rather than inventing a second
  one.
- `source` stays `manual` for an ehllo-authored event even once `external_id`
  is populated; the importer must not reclassify it as `calendar`, or ownership
  is lost on the next sync.
- Edit and cancel propagate too, or the two sides diverge on the second change
  rather than the first.
- A conflict rule. Last-writer-wins is explicitly not acceptable under DEC-031:
  when Google reports a change and ehllo holds a newer local revision, surface
  it rather than resolving silently.
- Per-event opt-in on create ("Add to my Google Calendar"), defaulting on when
  a calendar account is connected and healthy. Provider health is already a
  first-class state in the Product Source of Truth (`ok` / `not_connected` /
  `needs_reconnect` / `error`) and must gate the toggle.

## Sequencing

The attendance work is self-contained, needs no migration beyond an optional
index, and fixes a live correctness complaint. The sync work is a proper
vertical slice with a migration, a push path, retries, and conflict handling.

They should ship separately, attendance first.

## Open questions

- Should "Didn't attend" be shown at all, or is it noise? Proposed: show it,
  collapsed, and revisit once there is real usage.
- Should removing a calendar-sourced event suppress it as a candidate, or let
  it return? Proposed: let it return, since suppression is what caused this
  whole problem.

begin;

-- Two-way calendar sync, ehllo -> provider. The pull side has existed since
-- 202608101700; this is the half that pushes, plus the state the interface needs
-- to be honest about whether a push actually landed.
--
-- The retry shape is lifted from event_email_outbox deliberately rather than
-- invented again: attempt_count, next_attempt_at, last_attempt_at, last_error,
-- and a partial index over the rows still worth trying. Same semantics, so the
-- two are read the same way.
--
-- sync_state carries one value beyond doc 13's four. 'conflict' exists because
-- DEC-031 forbids resolving a disagreement by overwriting, and the importer now
-- keeps its hands off rows ehllo owns - so when the provider's copy of an
-- ehllo-authored event diverges, something has to say so. Without this the
-- guard would be silent, which is the failure mode this whole surface has been
-- full of: correct behaviour that no one can see.
alter table public.events
  add column if not exists sync_state text not null default 'none'
    check (sync_state in ('none', 'pending', 'synced', 'failed', 'conflict')),
  add column if not exists synced_at timestamptz,
  add column if not exists sync_provider text
    check (sync_provider is null or sync_provider in ('google', 'microsoft')),
  add column if not exists sync_attempt_count integer not null default 0
    check (sync_attempt_count between 0 and 10),
  add column if not exists sync_next_attempt_at timestamptz,
  add column if not exists sync_last_attempt_at timestamptz,
  add column if not exists sync_last_error text not null default '',
  add column if not exists sync_conflict_at timestamptz,
  -- Per-event opt-in. Defaults false so nothing already in the table starts
  -- pushing itself the moment this ships; the create flow decides per event,
  -- and only offers it when a calendar account is connected and healthy.
  add column if not exists calendar_push_enabled boolean not null default false;

comment on column public.events.sync_state is
  'Push state toward the calendar provider: none (never asked), pending (queued), synced, failed (retrying), conflict (provider diverged from an ehllo-authored event and was deliberately not applied).';

comment on column public.events.calendar_push_enabled is
  'Per-event opt-in for pushing to the connected calendar. False for calendar-sourced events, which the provider already has.';

create index if not exists events_sync_due_idx
  on public.events (sync_next_attempt_at, created_at)
  where sync_state in ('pending', 'failed') and sync_attempt_count < 8;

create index if not exists events_sync_conflict_idx
  on public.events (workspace_id, sync_conflict_at desc)
  where sync_state = 'conflict';

commit;

begin;

-- The original partial unique index (where external_id is not null) can't be
-- used as an ON CONFLICT target by Postgres/PostgREST upserts - every
-- syncCalendarCandidates upsert has been failing with 42P10 ("no unique or
-- exclusion constraint matching the ON CONFLICT specification") since this
-- table was created, silently (the API route swallows the error and returns
-- an empty candidate list), so no calendar-sourced event has ever actually
-- been saved. A plain unique constraint gives the same practical behavior -
-- SQL treats every NULL external_id (manual/link events) as distinct from
-- every other NULL, so multiple non-calendar events are still allowed - and
-- is a valid ON CONFLICT target.
drop index if exists public.events_workspace_external_uidx;

alter table public.events
  add constraint events_workspace_external_id_key unique (workspace_id, external_id);

commit;

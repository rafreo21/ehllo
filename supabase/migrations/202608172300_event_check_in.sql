begin;

-- Presence was inferred entirely from the clock: an event counted as "current"
-- when now fell inside its window, and when two windows overlapped the one that
-- started most recently won (see resolveCurrentEvent in lib/events.ts). That is
-- a guess, and it is the value used to tag scanned cards, reciprocal exchanges,
-- captured encounters and the follow-ups that come out of them — so a wrong
-- guess attributes real relationships to the wrong event, silently.
--
-- checked_in_at records the user actually saying "I'm here". It outranks the
-- time window wherever it is set, so two events on the same afternoon stop
-- being a coin toss.
--
-- It deliberately does NOT extend presence indefinitely: a check-in the user
-- forgets to close is still capped by the event's own window, exactly as an
-- inferred presence is. left_at remains the explicit close.
alter table public.event_attendance
  add column if not exists checked_in_at timestamptz;

comment on column public.event_attendance.checked_in_at is
  'When the user confirmed they are physically at this event. Outranks time-window inference for event attribution; still bounded by the event window and cleared by left_at.';

-- Finding "which event is this user checked into" runs on every card exchange,
-- vCard download and encounter save.
create index if not exists event_attendance_checked_in_idx
  on public.event_attendance (user_id, checked_in_at desc)
  where checked_in_at is not null and left_at is null;

commit;

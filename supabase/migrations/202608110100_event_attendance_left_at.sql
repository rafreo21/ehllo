begin;

-- Lets a user say "I've left" early for an event they're going to, without
-- editing the event's real end time. When set, this caps the effective end
-- of that event's presence window for passive-attach purposes (see
-- resolveCurrentEvent in lib/events.ts) at left_at instead of the event's
-- ends_at/default window.
alter table public.event_attendance
  add column if not exists left_at timestamptz;

commit;

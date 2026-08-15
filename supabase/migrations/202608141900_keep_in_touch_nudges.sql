begin;

-- "keep_in_touch" — a soft, system-generated nudge to reach out to someone
-- you connected with a while ago (1/3/7/30 days), distinct from a real
-- user-created follow-up. See app/api/cron/send-keep-in-touch-nudges.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('review_ready', 'follow_up_due', 'follow_up_overdue', 'shared_meeting_update', 'connection_added', 'keep_in_touch'));

commit;

begin;

-- Completing a follow-up told nobody.
--
-- A follow-up is an agreement between two people. One of them ticking it off is
-- news to the other - it is the moment the thing they were waiting on actually
-- happened - and until now that moment was silent on both sides. The person who
-- did the work got no acknowledgement, and the person waiting had no way to know
-- except by opening the app and noticing.
--
-- Its own type rather than reusing shared_meeting_update, so it can be switched
-- off on its own: someone who wants to know when a meeting is shared does not
-- necessarily want a ping every time a task is ticked.
--
-- Additive. Existing values are untouched, so nothing already stored changes
-- meaning.
alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'review_ready',
    'follow_up_due',
    'follow_up_overdue',
    'shared_meeting_update',
    'connection_added',
    'keep_in_touch',
    'contact_request',
    'follow_up_completed'
  ));

comment on column public.notifications.type is
  'What happened. follow_up_completed means the other party ticked off a follow-up you share with them.';

commit;

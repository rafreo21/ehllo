begin;

-- A contact request gets its own notification type.
--
-- When the request notification was first wired it reused
-- 'shared_meeting_update', which delivered but told two lies: the bell showed a
-- shared-meeting icon for "someone asked for your phone number", and anyone who
-- switched shared-meeting updates off lost contact requests with it - two
-- unrelated things behind one switch, with no way to keep one and drop the other.
--
-- Additive: the existing values are untouched, so nothing already stored or in
-- flight changes meaning.
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
    'contact_request'
  ));

comment on column public.notifications.type is
  'What happened. contact_request means somebody asked you for a contact detail - kept separate from shared_meeting_update so it can be turned off on its own.';

commit;

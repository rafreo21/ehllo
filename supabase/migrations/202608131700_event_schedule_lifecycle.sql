begin;

alter table public.events
  add column if not exists status text not null default 'scheduled',
  add column if not exists cancelled_at timestamptz;

alter table public.events drop constraint if exists events_status_check;
alter table public.events
  add constraint events_status_check check (status in ('scheduled', 'cancelled'));

alter table public.event_invitations
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists schedule_notice_sent_at timestamptz,
  add column if not exists cancellation_notice_sent_at timestamptz;

create policy "events_attendee_select" on public.events for select to authenticated
  using (exists (
    select 1 from public.event_attendance attendance
    join public.users app_user on app_user.id = attendance.user_id
    where attendance.event_id = events.id
      and app_user.auth_user_id = (select auth.uid())
  ));

create index if not exists event_invitations_reminder_due_idx
  on public.event_invitations (reminder_sent_at, status)
  where reminder_sent_at is null and status <> 'revoked';

comment on column public.event_invitations.reminder_sent_at is
  'Set only after a pre-event reminder email succeeds, making the hourly reminder cron at-most-once per invitation.';

commit;

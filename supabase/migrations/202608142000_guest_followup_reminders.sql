begin;

-- Tracks a one-time reminder email sent to an anonymous guest (no account)
-- about a follow-up action assigned to them — see
-- app/api/cron/send-guest-followup-reminders. Actions live inside
-- encounters.actions (jsonb), so this is a lightweight side table rather
-- than a column on that array.
create table public.guest_followup_reminders (
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  action_id text not null,
  sent_at timestamptz not null default now(),
  primary key (encounter_id, action_id)
);

alter table public.guest_followup_reminders enable row level security;
revoke all on public.guest_followup_reminders from anon, authenticated;

comment on table public.guest_followup_reminders is
  'One row per guest follow-up reminder email ever sent — service-role only, guests have no account/session to read this through.';

commit;

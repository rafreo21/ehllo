begin;

create extension if not exists pgcrypto;

create table public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invited_email text not null check (length(trim(invited_email)) between 3 and 320),
  token_hash text not null unique,
  status text not null default 'invited' check (status in ('invited', 'going', 'not_going', 'revoked')),
  claimed_by_user_id uuid references public.users(id) on delete set null,
  responded_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, invited_email)
);

create index event_invitations_event_status_idx on public.event_invitations (event_id, status);
create index event_invitations_claimed_user_idx on public.event_invitations (claimed_by_user_id)
  where claimed_by_user_id is not null;

alter table public.event_invitations enable row level security;
grant select, insert, update, delete on public.event_invitations to authenticated;

create policy "event_invitations_event_member_all" on public.event_invitations for all to authenticated
  using (exists (
    select 1 from public.events event
    join public.workspace_memberships membership on membership.workspace_id = event.workspace_id
    join public.users app_user on app_user.id = membership.user_id
    where event.id = event_invitations.event_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.events event
    join public.workspace_memberships membership on membership.workspace_id = event.workspace_id
    join public.users app_user on app_user.id = membership.user_id
    where event.id = event_invitations.event_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ));

comment on table public.event_invitations is
  'Claimable event membership for invited guests. A guest RSVP remains attached to the canonical event and becomes event_attendance after verified signup.';

create or replace function public.claim_event_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_invitation public.event_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select id, lower(primary_email) into v_user_id, v_user_email
  from public.users
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;
  if v_user_id is null then raise exception 'application user not provisioned'; end if;

  select * into v_invitation
  from public.event_invitations
  where token_hash = encode(digest(trim(p_token), 'sha256'), 'hex')
    and status <> 'revoked'
    and (expires_at is null or expires_at > now())
  for update;
  if v_invitation.id is null then raise exception 'event invitation not found'; end if;
  if lower(v_invitation.invited_email) <> v_user_email then raise exception 'invitation email does not match'; end if;

  update public.event_invitations
  set claimed_by_user_id = v_user_id, claimed_at = now(), updated_at = now()
  where id = v_invitation.id;

  if v_invitation.status in ('going', 'not_going') then
    insert into public.event_attendance (event_id, user_id, status, updated_at)
    values (v_invitation.event_id, v_user_id, v_invitation.status, now())
    on conflict (event_id, user_id) do update set
      status = excluded.status,
      left_at = null,
      updated_at = now();
  end if;

  return v_invitation.event_id;
end;
$$;

revoke all on function public.claim_event_invitation(text) from public;
grant execute on function public.claim_event_invitation(text) to authenticated;

commit;

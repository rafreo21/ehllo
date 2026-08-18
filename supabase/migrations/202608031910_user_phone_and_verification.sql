begin;

-- Internal account fields, distinct from the public-facing Card. Phone is
-- collected here (not on the Card) specifically for account verification.
alter table public.users
  add column phone text,
  add column phone_verified boolean not null default false,
  add column phone_verified_at timestamptz;

-- Adds new output columns, so the existing function must be dropped first -
-- CREATE OR REPLACE cannot change a function's return shape. Keeps the
-- workspace_name/type/role + active-workspace selection added by
-- team_workspaces - this function is also used by the team switcher.
drop function if exists public.get_my_app_context();

create function public.get_my_app_context()
returns table (
  user_id uuid,
  primary_email text,
  display_name text,
  avatar_url text,
  locale text,
  time_zone text,
  onboarding_status text,
  workspace_id uuid,
  workspace_name text,
  workspace_type text,
  workspace_role text,
  phone text,
  phone_verified boolean,
  email_verified boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id,
    u.primary_email,
    u.display_name,
    u.avatar_url,
    u.locale,
    u.time_zone,
    u.onboarding_status,
    w.id,
    w.name,
    w.type,
    m.role,
    u.phone,
    u.phone_verified,
    (au.email_confirmed_at is not null)
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  join auth.users au on au.id = u.auth_user_id
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
    and w.id = coalesce(
      u.active_workspace_id,
      (
        select w2.id
        from public.workspaces w2
        join public.workspace_memberships m2 on m2.workspace_id = w2.id
        where m2.user_id = u.id
          and m2.status = 'active'
          and m2.membership_kind = 'personal'
        limit 1
      )
    )
  limit 1
$$;

revoke all on function public.get_my_app_context() from public, anon;
grant execute on function public.get_my_app_context() to authenticated;

-- Updates the internal account profile (full name + phone). Changing the
-- phone number always resets verification - a re-verified number cannot be
-- inherited from a previous value.
create or replace function public.update_my_account_profile(
  p_display_name text, p_phone text
)
returns table (display_name text, phone text, phone_verified boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_display_name text := nullif(trim(p_display_name), '');
  v_phone text := nullif(trim(p_phone), '');
  v_previous_phone text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if v_display_name is not null and length(v_display_name) < 2 then
    raise exception 'invalid display name';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ()-]{6,20}$' then
    raise exception 'invalid phone number';
  end if;

  select u.phone into v_previous_phone from public.users u where u.auth_user_id = auth.uid();

  update public.users u set
    display_name = coalesce(v_display_name, u.display_name),
    phone = v_phone,
    phone_verified = case when v_phone is distinct from v_previous_phone then false else u.phone_verified end,
    phone_verified_at = case when v_phone is distinct from v_previous_phone then null else u.phone_verified_at end,
    updated_at = now()
  where u.auth_user_id = auth.uid();

  return query
    select u.display_name, u.phone, u.phone_verified
    from public.users u where u.auth_user_id = auth.uid();
end;
$$;

revoke all on function public.update_my_account_profile(text, text) from public, anon;
grant execute on function public.update_my_account_profile(text, text) to authenticated;

commit;

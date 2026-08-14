begin;

alter table public.cards add column if not exists is_primary boolean not null default false;

-- Seed a primary card per workspace so existing multi-card users don't land
-- with none selected: pick the oldest active (non-archived) card.
with ranked as (
  select id, workspace_id,
    row_number() over (partition by workspace_id order by created_at asc) as rn
  from public.cards
  where status <> 'archived'
)
update public.cards
set is_primary = true
from ranked
where public.cards.id = ranked.id and ranked.rn = 1;

create unique index if not exists cards_workspace_primary_key
  on public.cards (workspace_id)
  where is_primary;

create or replace function public.set_primary_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into v_context from public.get_my_app_context();
  if v_context.workspace_id is null then raise exception 'workspace not provisioned'; end if;

  select workspace_id into v_workspace_id
    from public.cards
   where id = p_card_id and workspace_id = v_context.workspace_id and status <> 'archived';

  if v_workspace_id is null then
    raise exception 'card not found';
  end if;

  update public.cards set is_primary = false
   where workspace_id = v_workspace_id and is_primary and id <> p_card_id;

  update public.cards set is_primary = true
   where id = p_card_id;
end;
$$;

revoke all on function public.set_primary_card(uuid) from public, anon;
grant execute on function public.set_primary_card(uuid) to authenticated;

commit;

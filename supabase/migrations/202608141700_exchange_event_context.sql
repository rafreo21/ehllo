begin;

alter table public.card_exchanges
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists card_exchanges_event_idx
  on public.card_exchanges (event_id) where event_id is not null;

create or replace function public.submit_card_exchange(
  p_slug text,
  p_visitor_name text,
  p_visitor_email text,
  p_visitor_company text,
  p_visitor_role text,
  p_visitor_phone text,
  p_note text,
  p_consent_given boolean,
  p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
  v_exchange_id uuid;
begin
  if coalesce(p_consent_given, false) is not true then
    raise exception 'consent required';
  end if;

  select card.id, card.workspace_id
  into v_card
  from public.cards card
  where card.slug = lower(trim(p_slug))
    and card.status = 'published';

  if v_card.id is null then
    raise exception 'card not found';
  end if;

  insert into public.card_exchanges (
    card_id,
    workspace_id,
    visitor_name,
    visitor_email,
    visitor_company,
    visitor_role,
    visitor_phone,
    note,
    consent_given,
    event_id
  ) values (
    v_card.id,
    v_card.workspace_id,
    trim(p_visitor_name),
    lower(trim(coalesce(p_visitor_email, ''))),
    trim(coalesce(p_visitor_company, '')),
    trim(coalesce(p_visitor_role, '')),
    trim(coalesce(p_visitor_phone, '')),
    trim(coalesce(p_note, '')),
    true,
    p_event_id
  )
  returning id into v_exchange_id;

  return v_exchange_id;
end;
$$;

revoke all on function public.submit_card_exchange(text, text, text, text, text, text, text, boolean, uuid) from public;
grant execute on function public.submit_card_exchange(text, text, text, text, text, text, text, boolean, uuid) to anon, authenticated;

comment on column public.card_exchanges.event_id is
  'The card owner''s currently-happening event at submission time, if any — resolveCurrentEventIdForWorkspace in lib/events-server.ts. An activator: null means this exchange has no event context, same as before this column existed.';

commit;

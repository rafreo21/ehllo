begin;

-- A card can carry several addresses, phone numbers, social profiles, and
-- other entries of the same kind. The UI and API cap each kind at three; this
-- trigger applies the same rule to every database writer.
alter table public.card_methods
  drop constraint if exists card_methods_card_id_method_type_key;

create or replace function public.enforce_card_method_type_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing_count integer;
begin
  select count(*)
  into existing_count
  from public.card_methods
  where card_id = new.card_id
    and method_type = new.method_type
    and (tg_op = 'INSERT' or id <> new.id);

  if existing_count >= 3 then
    raise exception 'A card can have at most three contact methods of each type.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists card_method_type_limit on public.card_methods;
create trigger card_method_type_limit
before insert or update of card_id, method_type on public.card_methods
for each row execute function public.enforce_card_method_type_limit();

-- An older provisioning function used the removed two-column unique
-- constraint as an ON CONFLICT target. Rewrite that one statement in the
-- installed function so new personal workspaces can still be provisioned.
do $$
declare
  old_definition text;
  new_definition text;
begin
  select pg_get_functiondef('public.provision_personal_workspace()'::regprocedure)
  into old_definition;

  new_definition := replace(
    old_definition,
    E'      on conflict (card_id, method_type) do nothing;\n',
    E';\n'
  );

  -- Fresh databases already receive the revised function from its original
  -- migration, while existing databases still need this replacement.
  if new_definition <> old_definition then
    execute new_definition;
  end if;
end;
$$;

commit;

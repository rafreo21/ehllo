begin;

-- Stale function overloads are a silent-data-loss trap.
--
-- PostgREST picks an overload from the argument names a caller supplies. When an
-- older signature survives alongside the current one, anything that omits a
-- newer argument - a client on a previous release, a hand-written call, a
-- retried request built from an older payload - resolves to the old function
-- instead of failing. It succeeds, returns an id, and quietly drops whatever
-- the newer arguments carried. Nothing logs, and the caller cannot tell.
--
-- That is not hypothetical here. The stale submit_card_exchange signatures
-- predate p_visitor_phone and p_event_id, so resolving to one of them discards
-- the visitor's phone number and the "where we met" event link - two of the
-- exact losses reported against this surface. The stale publish_my_card
-- signature predates p_expected_updated_at, so it has no optimistic-concurrency
-- check at all: reaching it would silently overwrite a card edited elsewhere,
-- which is precisely what DEC-031 forbids.
--
-- Verified before dropping: the only caller of publish_my_card is
-- app/api/cards/publish/route.ts (plus scripts/e2e-staging.mjs), and both send
-- p_show_company_details, so they bind to the 12-argument form. The only caller
-- of submit_card_exchange is app/api/cards/exchange/route.ts, which sends all
-- nine arguments. Dropping the older signatures removes an unreachable trap,
-- not a live path.
drop function if exists public.publish_my_card(
  text, text, text, text, text, text, text, text, text, jsonb
);

drop function if exists public.submit_card_exchange(
  text, text, text, text, text, text, boolean
);

drop function if exists public.submit_card_exchange(
  text, text, text, text, text, text, text, boolean
);

commit;

import assert from "node:assert/strict";
import test from "node:test";

import {
  appendVisitorIntentToCallback,
  buildAuthHref,
  parseVisitorIntent,
  visitorOnboardingPath,
} from "../lib/auth/visitor-intent.ts";
import {
  browserConnectionSource,
  recordConnectionScanSource,
} from "../lib/connection-scan-source.ts";

/** Records what the update chain was asked to do, without a database. */
function fakeSupabase() {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        update(values) {
          return {
            eq(column, value) {
              return {
                is(nullColumn, nullValue) {
                  calls.push({ table, values, column, value, nullColumn, nullValue });
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

test("a surface is only ever written over a null", async () => {
  const supabase = fakeSupabase();
  await recordConnectionScanSource(supabase, "conn-1", "nfc");

  assert.equal(supabase.calls.length, 1);
  const call = supabase.calls[0];
  assert.deepEqual(call.values, { scan_source: "nfc" });
  assert.equal(call.value, "conn-1");
  // This is what keeps it "where did we meet" rather than "where did I last scan them".
  assert.equal(call.nullColumn, "scan_source");
  assert.equal(call.nullValue, null);
});

test("an unrecognised surface is dropped rather than stored", async () => {
  const supabase = fakeSupabase();
  await recordConnectionScanSource(supabase, "conn-1", "wallet");
  await recordConnectionScanSource(supabase, "conn-1", "");
  await recordConnectionScanSource(supabase, "conn-1", null);
  assert.equal(supabase.calls.length, 0);
});

test("no connection means nothing is written", async () => {
  const supabase = fakeSupabase();
  await recordConnectionScanSource(supabase, undefined, "web");
  await recordConnectionScanSource(supabase, "", "web");
  assert.equal(supabase.calls.length, 0);
});

test("a browser arrival is web unless the link says otherwise", () => {
  assert.equal(browserConnectionSource(undefined), "web");
  assert.equal(browserConnectionSource(""), "web");
  // A tag tapped by somebody without the app lands in a browser. Calling that "web"
  // would lose the only interesting thing about it.
  assert.equal(browserConnectionSource("nfc"), "nfc");
  assert.equal(browserConnectionSource("camera"), "camera");
  // Junk falls back rather than travelling onward.
  assert.equal(browserConnectionSource("wallet"), "web");
});

test("the surface survives every hop of the visitor funnel", () => {
  const href = buildAuthHref({ intent: "visitor", slug: "card-abc", source: "nfc" });
  assert.match(href, /[?&]s=nfc/);

  const atAuth = parseVisitorIntent(new URLSearchParams(href.split("?")[1]));
  assert.equal(atAuth.source, "nfc");
  assert.equal(atAuth.slug, "card-abc");

  const callback = new URL("https://staging.ehllo.io/auth/callback");
  appendVisitorIntentToCallback(callback, atAuth);
  assert.equal(callback.searchParams.get("s"), "nfc");

  const atCallback = parseVisitorIntent(callback.searchParams);
  assert.equal(atCallback.source, "nfc");

  const onboarding = visitorOnboardingPath(atCallback);
  assert.match(onboarding, /[?&]s=nfc/);
  assert.equal(parseVisitorIntent(new URLSearchParams(onboarding.split("?")[1] + "&intent=visitor")).source, "nfc");
});

test("an unrecognised marker is dropped at the edge, not carried three redirects", () => {
  const intent = parseVisitorIntent(new URLSearchParams("intent=visitor&slug=card-abc&s=wallet"));
  assert.equal(intent.source, undefined);
  // And a link with no marker stays clean rather than gaining an empty parameter.
  assert.ok(!buildAuthHref({ intent: "visitor", slug: "card-abc" }).includes("s="));
});

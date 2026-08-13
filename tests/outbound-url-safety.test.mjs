import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isBlockedOutboundAddress } from "../lib/outbound-url-safety.ts";

describe("isBlockedOutboundAddress", () => {
  it("blocks IPv4 loopback and private ranges", () => {
    assert.equal(isBlockedOutboundAddress("127.0.0.1"), true);
    assert.equal(isBlockedOutboundAddress("10.0.0.5"), true);
    assert.equal(isBlockedOutboundAddress("172.16.0.1"), true);
    assert.equal(isBlockedOutboundAddress("172.31.255.255"), true);
    assert.equal(isBlockedOutboundAddress("192.168.1.1"), true);
  });

  it("blocks the cloud metadata link-local address", () => {
    assert.equal(isBlockedOutboundAddress("169.254.169.254"), true);
  });

  it("allows ordinary public IPv4 addresses", () => {
    assert.equal(isBlockedOutboundAddress("8.8.8.8"), false);
    assert.equal(isBlockedOutboundAddress("172.15.0.1"), false);
    assert.equal(isBlockedOutboundAddress("172.32.0.1"), false);
  });

  it("blocks IPv6 loopback and link-local/unique-local ranges", () => {
    assert.equal(isBlockedOutboundAddress("::1"), true);
    assert.equal(isBlockedOutboundAddress("fe80::1"), true);
    assert.equal(isBlockedOutboundAddress("fd00::1"), true);
  });

  it("unwraps an IPv4-mapped IPv6 address before checking it", () => {
    assert.equal(isBlockedOutboundAddress("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedOutboundAddress("::ffff:8.8.8.8"), false);
  });

  it("fails closed on an unresolvable value", () => {
    assert.equal(isBlockedOutboundAddress("not-an-ip"), true);
  });
});

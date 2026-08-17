import test from "node:test";
import assert from "node:assert/strict";

function describeOtpDeliveryError(error) {
  function extractNestedMessage(message) {
    const trimmed = message.trim();
    const firstBrace = trimmed.indexOf("{");
    if (firstBrace < 0) return "";
    try {
      const parsed = JSON.parse(trimmed.slice(firstBrace));
      return parsed.error?.message || parsed.message || "";
    } catch {
      return "";
    }
  }

  const message = error?.message?.trim() || extractNestedMessage(error?.message || "");
  const lower = message.toLowerCase();

  if (
    error?.code === "over_email_send_rate_limit"
    || error?.status === 429
    || lower.includes("rate")
  ) {
    return "Too many sign-in attempts. Please wait a few minutes before trying again.";
  }

  if (
    lower.includes("only send testing emails")
    || lower.includes("testing emails")
    || lower.includes("to your own email address")
    || lower.includes("verify a domain")
    || lower.includes("validation_error")
  ) {
    return "Sign-in codes are in email test mode. Only verified sender addresses can receive code emails right now.";
  }

  if (message && message.length < 180 && !lower.includes("internal")) {
    return message;
  }

  return "We couldn’t send the code. Please try again.";
}

test("maps Resend sandbox errors to a helpful sign-in message", () => {
  const message = describeOtpDeliveryError({
    message: "You can only send testing emails to your own email address (rafreo21@gmail.com).",
  });
  assert.match(message, /verified|test/i);
});

test("maps rate limit errors", () => {
  const message = describeOtpDeliveryError({
    code: "over_email_send_rate_limit",
    status: 429,
    message: "Email rate limit exceeded",
  });
  assert.match(message, /too many sign-in attempts/i);
});

test("extracts nested hook errors", () => {
  const message = describeOtpDeliveryError({
    message: `Error invoking edge function: {"error":{"message":"You can only send testing emails to your own email address."}}`,
  });
  assert.match(message, /sender/i);
});

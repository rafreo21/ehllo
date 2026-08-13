import test from "node:test";
import assert from "node:assert/strict";

function describeOtpDeliveryError(error) {
  const message = error?.message?.trim() || "";
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
    || lower.includes("verify a domain")
    || lower.includes("validation_error")
  ) {
    return "Sign-in codes can only be emailed after Ehllo verifies its sender domain. Try again shortly, or use Continue with Google if available.";
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
  assert.match(message, /sender domain/i);
});

test("maps rate limit errors", () => {
  const message = describeOtpDeliveryError({
    code: "over_email_send_rate_limit",
    status: 429,
    message: "Email rate limit exceeded",
  });
  assert.match(message, /too many sign-in attempts/i);
});

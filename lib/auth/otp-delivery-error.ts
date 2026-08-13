type AuthOtpError = {
  code?: string;
  message?: string;
  status?: number;
};

export function describeOtpDeliveryError(error: AuthOtpError | null | undefined) {
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

  if (
    lower.includes("email delivery is not configured")
    || lower.includes("missing resend")
    || lower.includes("hook")
  ) {
    return "Sign-in email delivery is temporarily unavailable. Please try again in a few minutes.";
  }

  if (lower.includes("invalid email") || lower.includes("unable to validate email")) {
    return "Enter a valid email address.";
  }

  if (message && message.length < 180 && !lower.includes("internal")) {
    return message;
  }

  return "We couldn’t send the code. Please try again.";
}

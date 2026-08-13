type AuthOtpError = {
  code?: string;
  message?: string;
  status?: number;
};

export function describeOtpDeliveryError(error: AuthOtpError | null | undefined) {
  const message = error?.message?.trim() || '';
  const lower = message.toLowerCase();

  if (
    error?.code === 'over_email_send_rate_limit'
    || error?.status === 429
    || lower.includes('rate')
  ) {
    return 'Too many sign-in attempts. Please wait a few minutes before trying again.';
  }

  if (
    lower.includes('only send testing emails')
    || lower.includes('verify a domain')
    || lower.includes('validation_error')
  ) {
    return 'Sign-in codes can only be emailed after Ehllo verifies its sender domain. Try again shortly.';
  }

  if (message && message.length < 180 && !lower.includes('internal')) {
    return message;
  }

  return 'We couldn’t send the code. Please try again.';
}

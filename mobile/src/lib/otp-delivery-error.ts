type AuthOtpError = {
  code?: string;
  message?: string;
  status?: number;
};

function extractNestedMessage(message: string): string {
  const trimmed = message.trim();
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace < 0) return '';

  try {
    const parsed = JSON.parse(trimmed.slice(firstBrace)) as {
      error?: { message?: string };
      message?: string;
    };
    const nested = parsed.error?.message ?? parsed.message;
    return typeof nested === 'string' ? nested.trim() : '';
  } catch {
    return '';
  }
}

export function describeOtpDeliveryError(error: AuthOtpError | null | undefined) {
  const message = error?.message?.trim() || extractNestedMessage(error?.message || '');
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
    || lower.includes('testing emails')
    || lower.includes('send test')
    || lower.includes('unverified domain')
    || lower.includes('domain is not verified')
    || (lower.includes('not verified') && lower.includes('from'))
    || lower.includes('to your own email address')
    || lower.includes('validation_error')
  ) {
    return 'Sign-in codes are in email test mode. Only verified sender addresses can receive code emails right now.';
  }

  if (
    lower.includes('email delivery is not configured')
    || lower.includes('missing resend')
    || lower.includes('hook')
  ) {
    return 'Sign-in email delivery is temporarily unavailable. Please try again in a few minutes.';
  }

  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Enter a valid email address.';
  }

  if (message && message.length < 180 && !lower.includes('internal')) {
    return message;
  }

  return 'We couldn’t send the code. Please try again.';
}

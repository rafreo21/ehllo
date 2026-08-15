import { isNetworkError } from '@/lib/mobile-api';

// Maps raw thrown errors (network exceptions, Supabase/Postgres errors, JS
// runtime errors) to copy a non-technical user can act on. Deliberately
// thrown app errors with already-friendly text pass through unchanged.
export function describeError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const message = (error instanceof Error ? error.message : String(error ?? '')).trim();
  const lower = message.toLowerCase();

  if (
    isNetworkError(error)
    || lower.includes('unable to resolve host')
    || lower.includes('no address associated with hostname')
    || lower.includes('unknownhostexception')
    || lower.includes('enotfound')
    || lower.includes('econnrefused')
  ) {
    return 'You appear to be offline. Check your connection and try again.';
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'That took too long to respond. Please try again.';
  }

  if (lower.includes('jwt') || lower.includes('401') || lower.includes('unauthorized') || lower.includes('not authenticated')) {
    return 'Your session has expired. Please sign in again.';
  }

  if (lower.includes('500') || lower.includes('internal server error') || lower.includes('502') || lower.includes('503')) {
    return 'Something went wrong on our end. Please try again shortly.';
  }

  const looksTechnical = !message
    || message.length > 160
    || lower.includes('exception')
    || lower.includes('java.')
    || lower.includes('stack trace')
    || lower.includes('unexpected token')
    || /^(typeerror|referenceerror|syntaxerror|rangeerror|error):/i.test(message);

  return looksTechnical ? fallback : message;
}

import { isOnline } from '@/lib/connectivity';
import { readEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

// RN's fetch polyfill throws a TypeError specifically for connectivity
// failures, while every deliberate domain error in this codebase throws a
// plain Error — so `instanceof TypeError` is a reliable signal without
// depending on fragile message text. isOnline() is layered on top so that
// if we already know we're offline, any error at that call site counts too.
export function isNetworkError(error: unknown): boolean {
  if (!isOnline()) return true;
  if (error instanceof TypeError) return true;
  return error instanceof Error && /network request failed/i.test(error.message);
}

// Plain fetch() has no timeout — a request that hangs server-side (or a
// dropped connection that never surfaces as an error) leaves the caller
// awaiting forever. That's exactly what left a capture stuck at "Preparing
// review" indefinitely with no way to cancel it. Every mobileFetch call now
// aborts after timeoutMs so a hang always resolves into a normal catchable
// error instead of hanging the UI state that depends on it.
const DEFAULT_TIMEOUT_MS = 45_000;

export async function mobileFetch(
  path: string,
  accessToken: string,
  init?: RequestInit & { timeoutMs?: number },
) {
  const env = readEnv();
  const base = env?.publicCardBaseUrl;
  if (!base) throw new Error('ehllo API URL is not configured.');

  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...requestInit } = init ?? {};

  async function request(token: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${base}${path}`, {
        ...requestInit,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(requestInit.headers || {}),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error("This is taking longer than expected. Check your connection and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  let response = await request(accessToken);
  if (response.status === 401) {
    const supabase = getSupabase();
    const { data } = await supabase?.auth.refreshSession() ?? { data: { session: null } };
    const refreshed = data.session?.access_token;
    if (refreshed && refreshed !== accessToken) {
      response = await request(refreshed);
    }
  }

  return response;
}

export async function readMobileApiJson<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    const contentType = response.headers.get('content-type') ?? '';
    const receivedHtml = contentType.includes('text/html') || raw.trimStart().startsWith('<');
    throw new Error(receivedHtml
      ? 'ehllo could not reach its API. The server may be temporarily unavailable or protected. Your work on this device is still safe.'
      : fallbackMessage);
  }
}

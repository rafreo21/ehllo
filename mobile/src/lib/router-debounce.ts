import { router } from 'expo-router';

// Android can deliver a burst of onPress events for a single tap when the JS
// thread is briefly busy (slower devices, Metro/dev-client overhead) — each
// one calls router.push/navigate with the same href, and expo-router stacks
// a new screen instance per call instead of deduping them. This wraps the
// three "go to a new screen" methods once, app-wide, so an identical call
// repeated within DEBOUNCE_MS of the last one is silently dropped instead of
// opening the same page multiple times.
const DEBOUNCE_MS = 600;

let installed = false;
let lastKey = '';
let lastAt = 0;

function debounceKey(args: unknown[]) {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args[0]);
  }
}

function guard<T extends (...args: never[]) => unknown>(fn: T): T {
  return ((...args: never[]) => {
    const key = debounceKey(args);
    const now = Date.now();
    if (key === lastKey && now - lastAt < DEBOUNCE_MS) return undefined;
    lastKey = key;
    lastAt = now;
    return fn(...args);
  }) as T;
}

export function installRouterDebounce() {
  if (installed) return;
  installed = true;
  router.push = guard(router.push);
  router.navigate = guard(router.navigate);
  router.replace = guard(router.replace);
}

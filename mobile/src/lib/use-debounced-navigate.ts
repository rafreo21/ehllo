import { router } from 'expo-router';
import { useRef } from 'react';

// Android (and occasionally iOS) can deliver more than one onPress call for
// a single tap when the JS thread is briefly busy - each call pushes another
// stack entry, so the same screen opens 2-3 times. A per-component ref-based
// cooldown is the reliable fix; an app-wide monkey-patch of router.push was
// tried first and didn't reliably prevent this, so every screen that
// navigates should use this hook directly instead of calling router.push.
const COOLDOWN_MS = 700;

export function useDebouncedNavigate() {
  const lastNavRef = useRef(0);
  return function navigate(href: Parameters<typeof router.push>[0]) {
    const now = Date.now();
    if (now - lastNavRef.current < COOLDOWN_MS) return;
    lastNavRef.current = now;
    router.push(href);
  };
}

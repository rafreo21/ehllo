import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { onReconnect } from '@/lib/connectivity';

const manualSyncListeners = new Set<() => void>();

/** Requests an immediate pass from every globally mounted foreground sync manager. */
export function requestForegroundSync() {
  for (const listener of manualSyncListeners) listener();
}

// Same trigger shape as card-context.tsx's sync effects (fire on mount,
// AppState -> active, a foreground-gated interval), plus a reconnect trigger
// that card-context predates and doesn't have.
export function useForegroundSync(enabled: boolean, run: () => void | Promise<void>, intervalMs = 30_000) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    if (!enabled) return;
    const task = setTimeout(() => { void runRef.current(); }, 0);
    return () => clearTimeout(task);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const manualSync = () => { void runRef.current(); };
    manualSyncListeners.add(manualSync);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runRef.current();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void runRef.current();
    }, intervalMs);
    const reconnectSubscription = onReconnect(() => { void runRef.current(); });
    return () => {
      manualSyncListeners.delete(manualSync);
      subscription.remove();
      clearInterval(interval);
      reconnectSubscription();
    };
  }, [enabled, intervalMs]);
}

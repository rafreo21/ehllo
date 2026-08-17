import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { onReconnect } from '@/lib/connectivity';

type ForegroundSyncListener = () => void | Promise<void>;

const manualSyncListeners = new Set<ForegroundSyncListener>();
let foregroundSyncTail = Promise.resolve();

/**
 * Keeps foreground reconciliation work from competing for the JS thread,
 * AsyncStorage, and the network when several queues wake up together.
 */
export function runSerializedForegroundWork(run: () => void | Promise<void>) {
  const result = foregroundSyncTail.then(run, run);
  foregroundSyncTail = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * Requests an immediate pass from every globally mounted foreground sync manager.
 * Returns when all managers have accepted (or rejected) the request.
 */
export async function requestForegroundSync() {
  await Promise.allSettled([...manualSyncListeners].map((listener) => Promise.resolve().then(() => listener())));
}

// Same trigger shape as card-context.tsx's sync effects (fire on mount,
// AppState -> active, a foreground-gated interval), plus a reconnect trigger
// that card-context predates and doesn't have.
export function useForegroundSync(enabled: boolean, run: () => void | Promise<void>, intervalMs = 30_000) {
  const runRef = useRef(run);
  const enabledRef = useRef(enabled);
  const runningRef = useRef(false);
  const rerunRequestedRef = useRef(false);
  const triggerRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    triggerRef.current = async () => {
      if (!enabledRef.current) return;
      if (runningRef.current) {
        rerunRequestedRef.current = true;
        return;
      }

      runningRef.current = true;
      try {
        await runSerializedForegroundWork(() => runRef.current())
          .catch(() => undefined);
      } finally {
        runningRef.current = false;
        if (rerunRequestedRef.current && enabledRef.current) {
          rerunRequestedRef.current = false;
          void triggerRef.current();
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const task = setTimeout(() => triggerRef.current(), 0);
    return () => clearTimeout(task);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const manualSync = () => triggerRef.current();
    manualSyncListeners.add(manualSync);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') triggerRef.current();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') triggerRef.current();
    }, intervalMs);
    const reconnectSubscription = onReconnect(() => triggerRef.current());
    return () => {
      enabledRef.current = false;
      rerunRequestedRef.current = false;
      manualSyncListeners.delete(manualSync);
      subscription.remove();
      clearInterval(interval);
      reconnectSubscription();
    };
  }, [enabled, intervalMs]);
}

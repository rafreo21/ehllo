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
  const runningPromiseRef = useRef<Promise<void> | null>(null);
  const rerunRequestedRef = useRef(false);
  const triggerRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    triggerRef.current = () => {
      if (!enabledRef.current) return Promise.resolve();
      if (runningPromiseRef.current) {
        rerunRequestedRef.current = true;
        return runningPromiseRef.current;
      }

      const pass = (async () => {
        do {
          rerunRequestedRef.current = false;
          await runSerializedForegroundWork(() => runRef.current())
            .catch(() => undefined);
        } while (rerunRequestedRef.current && enabledRef.current);
      })();

      const trackedPass = pass.finally(() => {
        if (runningPromiseRef.current === trackedPass) {
          runningPromiseRef.current = null;
        }
      });
      runningPromiseRef.current = trackedPass;
      return trackedPass;
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

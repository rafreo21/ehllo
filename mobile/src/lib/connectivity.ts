import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

// Optimistic until the first real event arrives — matches this codebase's
// existing "try the network call, swallow failures" philosophy rather than
// gating UI on a resolved connectivity check at startup.
let cachedOnline = true;
const listeners = new Set<(online: boolean) => void>();
let unsubscribe: (() => void) | null = null;
let pendingOnline: boolean | null = null;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

// Android's connectivity broadcasts can flap between values for the same
// real-world state (confirmed on-device via dumpsys: isConnected itself
// blips true — likely background WiFi scanning briefly reporting a
// connecting state — while the device is genuinely, continuously offline).
// Commit a change only once the new value holds for this long, so the UI
// doesn't flash on/off in sync with the noise. 1s wasn't enough to ride out
// the blips seen on-device; 3s comfortably covers them while still feeling
// responsive for a real transition.
const DEBOUNCE_MS = 3_000;

function resolveOnline(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
  if (state.isInternetReachable === null) return Boolean(state.isConnected);
  return Boolean(state.isConnected) && state.isInternetReachable;
}

function ensureSubscribed() {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    const online = resolveOnline(state);
    if (online === cachedOnline) {
      // Confirms the already-committed value — drop any stale pending flip.
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
        pendingOnline = null;
      }
      return;
    }
    if (online === pendingOnline) return; // already debouncing toward this value — let the original timer run
    if (pendingTimeout) clearTimeout(pendingTimeout);
    pendingOnline = online;
    pendingTimeout = setTimeout(() => {
      pendingTimeout = null;
      pendingOnline = null;
      cachedOnline = online;
      for (const listener of listeners) listener(online);
    }, DEBOUNCE_MS);
  });
}

export function isOnline() {
  ensureSubscribed();
  return cachedOnline;
}

export function subscribeConnectivity(listener: (online: boolean) => void) {
  ensureSubscribed();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function onReconnect(listener: () => void) {
  return subscribeConnectivity((online) => {
    if (online) listener();
  });
}

export function useIsOnline() {
  const [online, setOnline] = useState(() => isOnline());
  useEffect(() => {
    // Catches any change that happened between the initial render (above)
    // and this effect running — a real event fired in that window is
    // otherwise silently missed, since it only notifies listeners already
    // registered at the moment it fires, and there may be no further
    // connectivity change afterward to correct a stale read. No-op (React
    // bails out) when the value hasn't actually changed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(isOnline());
    return subscribeConnectivity(setOnline);
  }, []);
  return online;
}

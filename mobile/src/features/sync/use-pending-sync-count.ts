import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { readPendingSyncStatus, type PendingSyncStatus } from '@/features/sync/pending-sync-status';

const EMPTY_STATUS: PendingSyncStatus = {
  scans: [], quickFollowUps: [], followUpActions: [], transcriptions: [], eventActions: [],
  cardChanges: [], cardDeletes: [], items: [], total: 0,
};

// Lightweight poll so Home and the affected screens can show a small pending
// count without each re-implementing the same read + refresh-on-foreground
// logic pending-sync.tsx already has.
export function usePendingSyncCount() {
  const [status, setStatus] = useState(EMPTY_STATUS);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readPendingSyncStatus().then((next) => {
        if (active) setStatus(next);
      });
    };
    refresh();
    const interval = setInterval(refresh, 5_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return status;
}

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import { pushDevicePendingStatus, readOtherDevicesPendingCount } from '@/features/sync/device-pending-status';
import { isOnline } from '@/lib/connectivity';
import { getSupabase } from '@/lib/supabase';

const POLL_MS = 30_000;

// Pushes this device's own pending count (so other devices can see it) and
// reads back the aggregate from every other device on the account. A
// device only ever reports its own count and reads a sum - the actual
// pending items themselves never leave the device they're queued on.
export function useOtherDevicesPendingCount(myPendingCount: number) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [otherCount, setOtherCount] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;

    async function tick() {
      const supabase = getSupabase();
      if (!supabase || !isOnline()) return;
      try {
        await pushDevicePendingStatus(supabase, myPendingCount);
        const count = await readOtherDevicesPendingCount(supabase);
        if (active) setOtherCount(count);
      } catch {
        // Best-effort status ping - never worth surfacing an error for.
      }
    }

    void tick();
    const interval = setInterval(() => void tick(), POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tick();
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [accessToken, myPendingCount]);

  return accessToken ? otherCount : 0;
}

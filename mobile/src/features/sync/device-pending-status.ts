import type { SupabaseClient } from '@supabase/supabase-js';

import { getDeviceId } from '@/lib/device-id';

// Devices stop reporting once they're back in sync (pushPendingStatus is
// only called with count > 0 by the hook below), but a device that's lost
// forever (uninstalled, wiped) would otherwise leave a stale row claiming
// to have pending work forever — ignore anything older than this.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function pushDevicePendingStatus(supabase: SupabaseClient, pendingCount: number) {
  const deviceId = await getDeviceId();
  const { data: userRow } = await supabase.rpc('get_my_app_context').single();
  const userId = (userRow as { user_id?: string } | null)?.user_id;
  if (!userId) return;
  await supabase
    .from('device_pending_status')
    .upsert(
      { user_id: userId, device_id: deviceId, pending_count: pendingCount, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,device_id' },
    );
}

export async function readOtherDevicesPendingCount(supabase: SupabaseClient): Promise<number> {
  const deviceId = await getDeviceId();
  const since = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data } = await supabase
    .from('device_pending_status')
    .select('pending_count')
    .neq('device_id', deviceId)
    .gt('pending_count', 0)
    .gte('updated_at', since);
  if (!data) return 0;
  return data.reduce((sum, row) => sum + (row.pending_count ?? 0), 0);
}

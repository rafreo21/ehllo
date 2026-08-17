import type { SupabaseClient } from '@supabase/supabase-js';

import { getDeviceId } from '@/lib/device-id';

// Devices delete their row once they're back in sync. A device that's lost
// before it can report zero (for example, after a reinstall) can still leave
// a stale positive row, so only recent pings count and active devices prune
// anything older than this.
const STALE_AFTER_MS = 60 * 60 * 1000;

export async function pushDevicePendingStatus(supabase: SupabaseClient, pendingCount: number) {
  const deviceId = await getDeviceId();
  const { data: userRow, error: contextError } = await supabase.rpc('get_my_app_context').single();
  if (contextError) throw contextError;
  const userId = (userRow as { user_id?: string } | null)?.user_id;
  if (!userId) return;

  // A reinstall can generate a new per-install id before the old install had
  // a chance to report zero. Prune old pings for this account so they cannot
  // be counted as a second device indefinitely.
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { error: staleDeleteError } = await supabase
    .from('device_pending_status')
    .delete()
    .eq('user_id', userId)
    .lt('updated_at', staleBefore);
  if (staleDeleteError) throw staleDeleteError;

  if (pendingCount <= 0) {
    const { error } = await supabase
      .from('device_pending_status')
      .delete()
      .eq('user_id', userId)
      .eq('device_id', deviceId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('device_pending_status')
    .upsert(
      { user_id: userId, device_id: deviceId, pending_count: pendingCount, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,device_id' },
    );
  if (error) throw error;
}

export async function readOtherDevicesPendingCount(supabase: SupabaseClient): Promise<number> {
  const deviceId = await getDeviceId();
  const since = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data, error } = await supabase
    .from('device_pending_status')
    .select('pending_count')
    .neq('device_id', deviceId)
    .gt('pending_count', 0)
    .gte('updated_at', since);
  if (error) throw error;
  if (!data) return 0;
  return data.reduce((sum, row) => sum + (row.pending_count ?? 0), 0);
}

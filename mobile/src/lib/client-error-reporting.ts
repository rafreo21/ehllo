import { reportableAppVersion } from '@/lib/build-info';
import { Platform } from 'react-native';

import { mobileFetch } from '@/lib/mobile-api';
import { getSupabase } from '@/lib/supabase';

type ClientErrorReport = {
  route: string;
  message: string;
  stack?: string;
  componentStack?: string | null;
};

export async function reportClientError(report: ClientErrorReport) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const accessToken = data.session?.access_token;
    if (!accessToken) return;

    await mobileFetch('/api/diagnostics/client-errors', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...report,
        surface: 'mobile-consumer',
        appVersion: reportableAppVersion(),
        platform: `${Platform.OS} ${String(Platform.Version)}`,
      }),
    });
  } catch {
    // Reporting must never turn one recoverable UI failure into another crash.
  }
}

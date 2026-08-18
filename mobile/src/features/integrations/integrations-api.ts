import { mobileFetch } from '@/lib/mobile-api';

export type ConnectedAccountStatus = {
  google: {
    connected: boolean;
    needsReconnect: boolean;
    email: string;
    scopes: string[];
    capabilities: { gmail: boolean; calendar: boolean; drive: boolean };
  };
  microsoft: {
    connected: boolean;
    needsReconnect: boolean;
    email: string;
    scopes: string[];
    capabilities: { outlook: boolean; calendar: boolean; onedrive: boolean };
  };
  configured?: { google: boolean; microsoft: boolean };
};

/**
 * The calendar an event could actually be pushed to, or null.
 *
 * Mirrors what the server gates on, so the toggle is never offered against a
 * connection that would reject it: connected, calendar scope granted, and the
 * token not already known to be dead. A needs_reconnect account is worse than
 * none here, because it looks available and fails later.
 */
export function calendarPushProvider(status: ConnectedAccountStatus): 'google' | 'microsoft' | null {
  if (status.google.connected && !status.google.needsReconnect && status.google.capabilities.calendar) return 'google';
  if (status.microsoft.connected && !status.microsoft.needsReconnect && status.microsoft.capabilities.calendar) return 'microsoft';
  return null;
}

export function calendarProviderName(provider: 'google' | 'microsoft' | null) {
  if (provider === 'google') return 'Google Calendar';
  if (provider === 'microsoft') return 'Outlook Calendar';
  return 'your calendar';
}

export async function fetchConnectedAccounts(accessToken: string): Promise<ConnectedAccountStatus> {
  const response = await mobileFetch('/api/integrations/status', accessToken);
  if (!response.ok) {
    throw new Error('Unable to load connected accounts.');
  }
  const payload = await response.json() as { status?: ConnectedAccountStatus };
  return payload.status ?? {
    google: {
      connected: false,
      needsReconnect: false,
      email: '',
      scopes: [],
      capabilities: { gmail: false, calendar: false, drive: false },
    },
    microsoft: {
      connected: false,
      needsReconnect: false,
      email: '',
      scopes: [],
      capabilities: { outlook: false, calendar: false, onedrive: false },
    },
  };
}

export async function disconnectIntegration(accessToken: string, provider: 'google' | 'microsoft') {
  const response = await mobileFetch(`/api/integrations/${provider}`, accessToken, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Unable to disconnect account.');
  }
}

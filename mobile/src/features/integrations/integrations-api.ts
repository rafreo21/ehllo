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

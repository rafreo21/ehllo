import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppleIcon, GoogleIcon, LinkedInIcon, MicrosoftIcon } from '@/components/provider-icons';
import { Body, Button, PageHeader, Panel, PillButton, Screen } from '@/components/ui';
import { DisconnectAccountSheet } from '@/components/disconnect-account-sheet';
import { EmptyState } from '@/components/empty-state';
import { OutcomeErrorSheet } from '@/components/outcome-error-sheet';
import { OutcomeSuccessSheet } from '@/components/outcome-success-sheet';
import { SettingsSkeleton } from '@/components/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import {
  disconnectIntegration,
  fetchConnectedAccounts,
  type ConnectedAccountStatus,
} from '@/features/integrations/integrations-api';
import { readEnv } from '@/lib/env';
import { colors, spacing } from '@/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

type ProviderRow = {
  id: 'google' | 'microsoft' | 'linkedin' | 'apple';
  name: string;
  description: string;
  icon: React.ReactNode;
  connectable: boolean;
};

const PROVIDERS: ProviderRow[] = [
  {
    id: 'google',
    name: 'Google',
    description: 'One connection for Gmail, Calendar, and recording storage in Drive.',
    icon: <GoogleIcon size={20} />,
    connectable: true,
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    description: 'One connection for Outlook, Calendar, and recording storage in OneDrive.',
    icon: <MicrosoftIcon size={20} />,
    connectable: true,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Coming soon. Connect your LinkedIn profile for richer follow-ups.',
    icon: <LinkedInIcon size={20} />,
    connectable: false,
  },
  {
    id: 'apple',
    name: 'Apple',
    description: 'Coming soon. Connect Apple services for contacts and calendar.',
    icon: <AppleIcon size={20} />,
    connectable: false,
  },
];

export default function ConnectedAccountsScreen() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const params = useLocalSearchParams<{ integration?: string | string[] }>();
  const [status, setStatus] = useState<ConnectedAccountStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<'google' | 'microsoft' | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      await Promise.resolve();
      setInitialLoading(false);
      return;
    }
    const next = await fetchConnectedAccounts(accessToken);
    setStatus(next);
    setInitialLoading(false);
  }, [accessToken]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    const integration = Array.isArray(params.integration) ? params.integration[0] : params.integration;
    if (!integration) return;
    void Promise.resolve().then(() => {
      if (integration.endsWith('-connected')) {
        setMessage(integration.startsWith('google')
          ? 'Google connected. Gmail, Calendar, and Drive are now available from one account.'
          : 'Microsoft connected. Outlook, Calendar, and OneDrive are now available from one account.');
        return;
      }
      if (integration.endsWith('-error')) {
        setError('We couldn’t connect that account. Try again.');
        return;
      }
      if (integration.endsWith('-unconfigured')) {
        setError('Integration credentials are not configured yet.');
      }
    });
  }, [params.integration]);

  async function connectProvider(provider: 'google' | 'microsoft') {
    if (!accessToken) {
      router.push('/auth');
      return;
    }

    const env = readEnv();
    if (!env) {
      setError('ehllo API URL is not configured.');
      return;
    }

    setBusyProvider(provider);
    setError('');
    setMessage('');

    try {
      const callbackUrl = Linking.createURL('integrations/callback');
      const connectUrl = `${env.publicCardBaseUrl}/api/integrations/${provider}/connect?return_to=${encodeURIComponent(callbackUrl)}&access_token=${encodeURIComponent(accessToken)}`;
      const result = await WebBrowser.openAuthSessionAsync(connectUrl, callbackUrl);
      if (result.type === 'success' && result.url) {
        handleCallbackUrl(result.url);
      }
      await refresh();
    } catch {
      setError(`We couldn’t connect ${provider === 'google' ? 'Google' : 'Microsoft'}. Try again.`);
    } finally {
      setBusyProvider(null);
    }
  }

  function handleCallbackUrl(url: string) {
    const integration = new URL(url).searchParams.get('integration') || '';
    if (integration.endsWith('-connected')) {
      setMessage(integration.startsWith('google')
        ? 'Google connected. Gmail, Calendar, and Drive are now available from one account.'
        : 'Microsoft connected. Outlook, Calendar, and OneDrive are now available from one account.');
      return;
    }
    if (integration.endsWith('-error')) {
      setError('We couldn’t connect that account. Try again.');
      return;
    }
    if (integration.endsWith('-unconfigured')) {
      setError('Integration credentials are not configured yet.');
    }
  }

  async function disconnect(provider: 'google' | 'microsoft') {
    if (!accessToken) return;
    setBusyProvider(provider);
    setError('');
    setMessage('');
    try {
      await disconnectIntegration(accessToken, provider);
      setMessage(`${provider === 'google' ? 'Google' : 'Microsoft'} disconnected.`);
      await refresh();
    } catch {
      setError('We couldn’t disconnect that account.');
    } finally {
      setBusyProvider(null);
    }
  }

  function providerStatus(id: ProviderRow['id']) {
    if (!status) return null;
    if (id === 'google') return status.google;
    if (id === 'microsoft') return status.microsoft;
    return null;
  }

  const header = (
    <>
      <PageHeader eyebrow="Settings" title="Connected accounts" />
      <Body>
        Connect the accounts ehllo can use for approved outbound drafts, calendar scheduling, and future integrations.
      </Body>
    </>
  );

  return (
    <Screen header={header}>
      {session && initialLoading ? <SettingsSkeleton /> : null}

      {!session ? (
        <EmptyState
          illustration={require('@/assets/animations/connected-accounts.json')}
          title="Sign in to connect accounts"
          copy="Connect Gmail, Outlook, and other accounts for calendar and recording sync."
          primaryLabel="Sign in"
          onPrimary={() => router.push('/auth')}
        />
      ) : null}

      {session && !initialLoading ? (
      <View style={styles.list}>
        {PROVIDERS.map((provider) => {
          const account = providerStatus(provider.id);
          const connected = Boolean(account?.connected);
          const needsReconnect = Boolean(account?.needsReconnect);
          const loading = busyProvider === provider.id;

          return (
            <Panel key={provider.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>{provider.icon}</View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{provider.name}</Text>
                  <Text style={styles.cardDescription}>
                    {needsReconnect
                      ? 'Connection stopped working. Reconnect to keep syncing.'
                      : connected && account?.email ? account.email : provider.description}
                  </Text>
                  {provider.id === 'google' && connected ? (
                    <Text style={styles.capabilityLine}>
                      {([['gmail', 'Gmail'], ['calendar', 'Calendar'], ['drive', 'Drive']] as const).map(
                        ([capability, label], index) => {
                          const enabled = status?.google.capabilities[capability] ?? false;
                          return (
                            <Text key={capability}>
                              {index > 0 ? ' · ' : ''}
                              <Text style={enabled ? undefined : styles.capabilityOff}>{label}</Text>
                            </Text>
                          );
                        },
                      )}
                    </Text>
                  ) : null}
                  {provider.id === 'microsoft' && connected ? (
                    <Text style={styles.capabilityLine}>
                      {([['outlook', 'Outlook'], ['calendar', 'Calendar'], ['onedrive', 'OneDrive']] as const).map(
                        ([capability, label], index) => {
                          const enabled = status?.microsoft.capabilities[capability] ?? false;
                          return (
                            <Text key={capability}>
                              {index > 0 ? ' · ' : ''}
                              <Text style={enabled ? undefined : styles.capabilityOff}>{label}</Text>
                            </Text>
                          );
                        },
                      )}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.actionRow}>
                {!provider.connectable ? (
                  <Text style={styles.soon}>Coming soon</Text>
                ) : loading ? (
                  <ActivityIndicator color={colors.ink} />
                ) : needsReconnect ? (
                  <PillButton tone="solid" onPress={() => void connectProvider(provider.id as 'google' | 'microsoft')}>
                    Reconnect
                  </PillButton>
                ) : connected ? (
                  provider.id === 'google' && !status?.google.capabilities.drive ? (
                    <PillButton tone="solid" onPress={() => void connectProvider('google')}>Reconnect for Drive</PillButton>
                  ) : provider.id === 'microsoft' && !status?.microsoft.capabilities.onedrive ? (
                    <PillButton tone="solid" onPress={() => void connectProvider('microsoft')}>Reconnect for OneDrive</PillButton>
                  ) : (
                    <PillButton tone="outline" onPress={() => setPendingDisconnect(provider.id as 'google' | 'microsoft')}>
                      Disconnect
                    </PillButton>
                  )
                ) : (
                  <PillButton tone="solid" onPress={() => void connectProvider(provider.id as 'google' | 'microsoft')}>
                    {`Connect ${provider.name}`}
                  </PillButton>
                )}
              </View>
            </Panel>
          );
        })}
      </View>
      ) : null}
      <OutcomeSuccessSheet
        visible={Boolean(message)}
        title="Account updated"
        message={message}
        onClose={() => setMessage('')}
      />
      <OutcomeErrorSheet
        visible={Boolean(error)}
        title="Account connection failed"
        message={error}
        hint="Your existing ehllo data has not been changed."
        onClose={() => setError('')}
      />
      <DisconnectAccountSheet
        visible={Boolean(pendingDisconnect)}
        providerName={pendingDisconnect === 'google' ? 'Google' : 'Microsoft'}
        loading={Boolean(pendingDisconnect) && busyProvider === pendingDisconnect}
        onCancel={() => setPendingDisconnect(null)}
        onConfirm={() => {
          const provider = pendingDisconnect;
          if (!provider) return;
          void disconnect(provider).then(() => setPendingDisconnect(null));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.x3 },
  card: { gap: spacing.x4 },
  cardHeader: { flexDirection: 'row', gap: spacing.x3, alignItems: 'flex-start' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  cardDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  // Capability list styled like the event cell's dot-separated meta line.
  capabilityLine: { color: colors.muted, fontSize: 12 },
  capabilityOff: { opacity: 0.45 },
  // Align the action with the title/description text column: icon width (40) + header gap.
  actionRow: { marginLeft: 40 + spacing.x3 },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  panelCopy: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 19 },
  soon: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
});

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppUpdateManager } from '@/features/app-updates/app-update-manager';
import { AuthProvider } from '@/features/auth/auth-context';
import { CardProvider } from '@/features/card/card-context';
import { FollowUpSyncManager } from '@/features/follow-ups/follow-up-sync-manager';
import { QuickFollowUpSyncManager } from '@/features/follow-ups/quick-follow-up-sync-manager';
import { OfflineScanSyncManager } from '@/features/connections/offline-scan-sync-manager';
import { NotificationManager } from '@/features/notifications/notification-manager';
import { ActiveCaptureBanner } from '@/components/active-capture-banner';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { CaptureRecorderProvider } from '@/features/encounters/capture-recorder-context';
import { CaptureTranscriptionSyncManager } from '@/features/encounters/capture-transcription-sync-manager';
import { EventActionSyncManager } from '@/features/events/event-action-sync-manager';
import { WidgetQrRenderer } from '@/lib/widget-qr-renderer';
import { colors } from '@/theme/tokens';

Sentry.init({
  dsn: Constants.expoConfig?.extra?.sentryDsn,
  environment: Constants.expoConfig?.extra?.appVariant || 'unknown',
  tracesSampleRate: 0.1,
  enableAutoSessionTracking: true,
});

function applyAndroidNavigationBar() {
  NavigationBar.setStyle('dark');
}

SplashScreen.setOptions({
  duration: 250,
  fade: true,
});

function RootNavigator() {
  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="onboarding/use-case"
        options={{ presentation: 'transparentModal', headerShown: false, animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen name="auth/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="auth/callback" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="share-card" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="scanner" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="edit-card" />
      <Stack.Screen name="capture" />
      <Stack.Screen name="quick-follow-up" />
      <Stack.Screen name="card-tools" />
      <Stack.Screen name="program-nfc" />
      <Stack.Screen name="connections" />
      <Stack.Screen name="connections/[id]" />
      <Stack.Screen name="settings/connected-accounts" />
      <Stack.Screen name="settings/follow-ups" />
      <Stack.Screen name="settings/follow-ups-history" />
      <Stack.Screen name="settings/pending-sync" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="integrations/callback" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}

function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.canvas);

    if (Platform.OS !== 'android') {
      return;
    }

    applyAndroidNavigationBar();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        applyAndroidNavigationBar();
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <SafeAreaProvider>
          <AuthProvider>
            <AppUpdateManager />
            <NotificationManager />
            <FollowUpSyncManager />
            <QuickFollowUpSyncManager />
            <OfflineScanSyncManager />
            <CaptureTranscriptionSyncManager />
            <EventActionSyncManager />
            <CardProvider>
              <CaptureRecorderProvider>
                <StatusBar style="dark" />
                {Platform.OS === 'android' ? <NavigationBar style="dark" /> : null}
                <View style={{ flex: 1 }}>
                  <RootNavigator />
                  <ActiveCaptureBanner />
                  <WidgetQrRenderer />
                </View>
              </CaptureRecorderProvider>
            </CardProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);

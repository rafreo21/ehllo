import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { SharedMeetingSheet } from '@/components/shared-meeting-sheet';
import { Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';

/**
 * A meeting somebody shared with you, opened straight from a notification.
 *
 * "X shared a meeting with you" used to land on the people list, and the variant sent to
 * everyone else in the meeting landed on /capture/[id] - the owner's review screen, which a
 * guest cannot load at all, so it reported "encounter not found". Being told a meeting is
 * ready and then shown either the wrong screen or an error is worse than not being told.
 *
 * Deliberately thin: it mounts the same sheet the history list opens, so the guest view has
 * one implementation. Everything - the loading state, the recap, the request-access path if
 * it turns out not to be shared after all - already lives there.
 */
export default function SharedMeetingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const encounterId = typeof id === 'string' ? id.trim() : '';

  return (
    <Screen edges={['top', 'bottom']} reserveTabBar={false}>
      {/* The sheet is the whole screen here, so the page behind it is intentionally empty
          rather than a second copy of the meeting showing through. */}
      <View />
      <SharedMeetingSheet
        visible={Boolean(encounterId)}
        encounterId={encounterId || null}
        accessToken={session?.access_token ?? null}
        onClose={() => {
          // back() would strand anyone arriving from a cold start via a notification, since
          // there is nothing behind this screen to go back to.
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)');
        }}
      />
    </Screen>
  );
}

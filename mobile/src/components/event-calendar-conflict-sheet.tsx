import LottieView from 'lottie-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import type { EventItem } from '@/features/events/events-api';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * Says out loud that the calendar and ehllo disagree.
 *
 * The importer refuses to overwrite an event ehllo owns, which is correct and
 * was completely invisible: the row simply stopped matching the calendar and
 * nothing anywhere said so. This is the part that makes the guard worth having.
 *
 * Only one resolution is offered. ehllo does not keep what the provider said -
 * the importer declines the change rather than storing it - so "use the
 * calendar's version" is not something this could honour, and the copy points at
 * the calendar itself instead of pretending otherwise.
 */
export function EventCalendarConflictSheet({
  visible,
  event,
  loading,
  onKeepMine,
  onClose,
}: {
  visible: boolean;
  event: EventItem | null;
  loading?: boolean;
  onKeepMine: () => void;
  onClose: () => void;
}) {
  const showIllustration = useDeferredMount(visible);
  if (!event) return null;

  return (
    <BottomSheet
      visible={visible}
      title="Calendar differs"
      onClose={onClose}
      footer={
        <>
          <Button loading={loading} onPress={onKeepMine}>Keep this version</Button>
          <Button variant="ghost" onPress={onClose}>Leave it for now</Button>
        </>
      }>
      <View style={styles.illustration}>
        {showIllustration ? (
          <LottieView
            source={require('@/assets/animations/warning.json')}
            autoPlay
            loop={false}
            style={styles.lottie}
          />
        ) : null}
      </View>
      <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
      <Body style={styles.copy}>
        Your calendar has a different version of this event. Nothing was overwritten, so what you see here is still yours.
      </Body>
      <Body style={styles.copy}>
        Keeping this version updates the calendar to match. To go the other way, change it in your calendar and it will come back across.
      </Body>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  illustration: { alignSelf: 'center', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  lottie: { width: '100%', height: '100%' },
  eventTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  copy: { textAlign: 'center', marginTop: -spacing.x2 },
});

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/ui';
import type { EventItem } from '@/features/events/events-api';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

function dateLabel(value: Date) {
  return value.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function EventManageSheet({ event, loading, error, onClose, onSave, onCancelEvent }: {
  event: EventItem | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: { title: string; location: string; startsAt: string; endsAt: string | null }) => void;
  onCancelEvent: () => void;
}) {
  const [title, setTitle] = useState(() => event?.title ?? '');
  const [location, setLocation] = useState(() => event?.location ?? '');
  const [start, setStart] = useState(() => event ? new Date(event.startsAt) : new Date());
  const [end, setEnd] = useState<Date | null>(() => event?.endsAt ? new Date(event.endsAt) : null);

  function openAndroidPicker(target: 'start' | 'end') {
    const current = target === 'start' ? start : end ?? new Date(start.getTime() + 60 * 60 * 1000);
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      onChange: (_, selectedDate) => {
        if (!selectedDate) return;
        DateTimePickerAndroid.open({
          value: selectedDate,
          mode: 'time',
          onChange: (__, selectedTime) => {
            if (!selectedTime) return;
            const next = new Date(selectedDate);
            next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            if (target === 'start') setStart(next); else setEnd(next);
          },
        });
      },
    });
  }

  const valid = title.trim() && !Number.isNaN(start.getTime()) && (!end || end > start);
  return (
    <BottomSheet visible={Boolean(event)} title="Manage event" onClose={onClose}>
      <View style={styles.field}><Text style={styles.label}>Event name</Text><TextInput value={title} onChangeText={setTitle} style={styles.input} /></View>
      <View style={styles.field}><Text style={styles.label}>Location</Text><TextInput value={location} onChangeText={setLocation} style={styles.input} /></View>
      <View style={styles.field}>
        <Text style={styles.label}>Starts</Text>
        {Platform.OS === 'ios' ? <DateTimePicker value={start} mode="datetime" onChange={(_, value) => value && setStart(value)} /> : (
          <Pressable accessibilityRole="button" onPress={() => openAndroidPicker('start')} style={styles.dateButton}><Text style={styles.dateText}>{dateLabel(start)}</Text></Pressable>
        )}
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Ends</Text>
        {Platform.OS === 'ios' ? <DateTimePicker value={end ?? new Date(start.getTime() + 60 * 60 * 1000)} mode="datetime" onChange={(_, value) => value && setEnd(value)} /> : (
          <Pressable accessibilityRole="button" onPress={() => openAndroidPicker('end')} style={styles.dateButton}><Text style={styles.dateText}>{end ? dateLabel(end) : 'Add end time'}</Text></Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button disabled={!valid || loading} loading={loading} onPress={() => onSave({ title: title.trim(), location: location.trim(), startsAt: start.toISOString(), endsAt: end?.toISOString() ?? null })}>Save changes</Button>
      <Button variant="secondary" disabled={loading} onPress={() => Alert.alert('Cancel this event?', 'Invited guests will be notified and their invitation will show that the event was cancelled.', [
        { text: 'Keep event', style: 'cancel' },
        { text: 'Cancel event', style: 'destructive', onPress: onCancelEvent },
      ])}>Cancel event</Button>
      <Text style={styles.hint}>Guests are emailed when the schedule, location or event status changes. Their private notes and captures remain untouched.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.x2 },
  label: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  // fontSize is required, not optional. A TextInput carrying a custom
  // fontFamily with no explicit size renders Cereal with broken metrics on
  // iOS - every glyph spaced out, as if letterSpacing had been set. Text
  // components with the same family are fine; only TextInput is affected,
  // which is why it only showed up on fields.
  input: { fontFamily: fonts.regular, fontSize: 15, minHeight: 52, paddingHorizontal: spacing.x4, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, color: colors.ink, backgroundColor: colors.canvas },
  dateButton: { minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.x4, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, backgroundColor: colors.canvas },
  dateText: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
});

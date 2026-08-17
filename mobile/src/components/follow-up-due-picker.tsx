import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  DUE_PRESETS,
  dueDateFromPreset,
  formatCustomDueDate,
  inferDuePreset,
  shiftDueDate,
  toIsoDate,
  type DuePreset,
} from '@/lib/due-date';
import { CaretLeft, CaretRight } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/ui';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type FollowUpDuePickerProps = {
  dueAt: string;
  onChange: (dueAt: string) => void;
  label?: string;
};

function dueDateValue(isoDate: string) {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function FollowUpDuePicker({ dueAt, onChange, label = 'When should you do this?' }: FollowUpDuePickerProps) {
  const activePreset = inferDuePreset(dueAt);
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [iosPickerDate, setIosPickerDate] = useState(() => dueDateValue(dueAt));

  function openDatePicker(nextIso = dueAt) {
    const value = dueDateValue(nextIso);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        display: 'calendar',
        onChange: (event, date) => {
          if (event.type === 'set' && date) {
            onChange(toIsoDate(date));
          }
        },
      });
      return;
    }
    setIosPickerDate(value);
    setIosPickerOpen(true);
  }

  function selectPreset(preset: DuePreset) {
    if (preset === 'none') {
      onChange('');
      return;
    }
    if (preset === 'custom') {
      const nextDate = dueAt.trim() || dueDateFromPreset('in_3_days');
      onChange(nextDate);
      openDatePicker(nextDate);
      return;
    }
    onChange(dueDateFromPreset(preset));
  }

  function confirmIosDate() {
    onChange(toIsoDate(iosPickerDate));
    setIosPickerOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {DUE_PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            accessibilityRole="button"
            onPress={() => selectPreset(preset.id)}
            style={[styles.chip, activePreset === preset.id && styles.chipActive]}>
            <Text style={[styles.chipText, activePreset === preset.id && styles.chipTextActive]}>
              {preset.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {activePreset === 'custom' ? (
        <View style={styles.customRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => onChange(shiftDueDate(dueAt, -1))}
            style={styles.stepButton}>
            <CaretLeft size={16} color={colors.ink} weight="bold" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
            onPress={() => openDatePicker(dueAt)}
            style={styles.customDateButton}>
            <Text style={styles.customDate}>{formatCustomDueDate(dueAt)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            onPress={() => onChange(shiftDueDate(dueAt, 1))}
            style={styles.stepButton}>
            <CaretRight size={16} color={colors.ink} weight="bold" />
          </Pressable>
        </View>
      ) : null}

      {Platform.OS === 'ios' ? (
        <BottomSheet
          visible={iosPickerOpen}
          title="Pick a date"
          onClose={() => setIosPickerOpen(false)}
          footer={<Button onPress={confirmIosDate}>Use this date</Button>}>
          <DateTimePicker
            value={iosPickerDate}
            mode="date"
            display="spinner"
            onChange={(_, date) => {
              if (date) setIosPickerDate(date);
            }}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.x3 },
  label: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800', textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  chip: {
    paddingHorizontal: spacing.x3,
    paddingVertical: spacing.x2,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.x2,
    paddingVertical: spacing.x2,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  customDateButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.x2,
  },
  customDate: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontWeight: '800' },
});

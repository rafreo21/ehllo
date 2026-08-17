import { CaretDown, CaretUp } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing, fonts } from '@/theme/tokens';

type CollapsibleTranscriptSectionProps = {
  title?: string;
  hint?: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  defaultOpen?: boolean;
  showWhenEmpty?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
};

export function CollapsibleTranscriptSection({
  title = 'Transcript',
  hint = 'Expand to view or edit',
  value,
  onChangeText,
  placeholder,
  defaultOpen = false,
  showWhenEmpty = false,
  open: controlledOpen,
  onOpenChange,
  children,
}: CollapsibleTranscriptSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;

  function setOpen(next: boolean) {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  if (!value.trim() && !children && !showWhenEmpty) return null;

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.toggle}>
        <View style={styles.toggleCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        {open ? (
          <CaretUp size={16} color={colors.ink} weight="bold" />
        ) : (
          <CaretDown size={16} color={colors.ink} weight="bold" />
        )}
      </Pressable>

      {open ? (
        <>
          {children}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled
            editable={Boolean(onChangeText)}
            style={[styles.input, styles.field]}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.x3,
    paddingTop: spacing.x2,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
  },
  toggleCopy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15,
  },
  field: { height: 220, maxHeight: 220, paddingTop: spacing.x4, textAlignVertical: 'top' },
});

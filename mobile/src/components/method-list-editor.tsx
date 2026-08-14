import * as Haptics from 'expo-haptics';
import { DotsSixVertical, Plus, Trash } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { BottomSheet } from '@/components/bottom-sheet';
import { PhoneInput } from '@/components/phone-input';
import { Button } from '@/components/ui';
import {
  fieldLabel,
  labelSuggestions,
  METHOD_CATEGORIES,
  METHOD_META,
  methodsForCategory,
  validateMethod,
} from '@/features/card/method-meta';
import type { ContactMethod, ContactMethodType } from '@/features/card/types';
import { colors, radius, spacing } from '@/theme/tokens';

function createMethodId() {
  return `method-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

type MethodListEditorProps = {
  methods: ContactMethod[];
  onChange: (methods: ContactMethod[]) => void;
};

function MethodRow({
  method,
  index,
  total,
  onOpen,
  onRemove,
  onMove,
}: {
  method: ContactMethod;
  index: number;
  total: number;
  onOpen: () => void;
  onRemove: () => void;
  onMove: (from: number, direction: -1 | 1) => void;
}) {
  const offsetY = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((event) => {
      // Reanimated shared values are intentionally mutable on the UI thread.
      offsetY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY < -36 && index > 0) runOnJS(onMove)(index, -1);
      else if (event.translationY > 36 && index < total - 1) runOnJS(onMove)(index, 1);
      offsetY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offsetY.value * 0.15 }],
  }));

  return (
    <Animated.View style={[styles.row, animatedStyle]}>
      <GestureDetector gesture={pan}>
        <View style={styles.dragHandle}>
          <DotsSixVertical size={18} color={colors.muted} weight="bold" />
        </View>
      </GestureDetector>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.rowMain}>
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeText}>{METHOD_META[method.type].name.slice(0, 1)}</Text>
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{method.label || METHOD_META[method.type].name}</Text>
          <Text numberOfLines={1} style={styles.rowValue}>{method.value}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onRemove} style={styles.removeBtn}>
        <Trash size={16} color={colors.danger} />
      </Pressable>
    </Animated.View>
  );
}

export function MethodListEditor({ methods, onChange }: MethodListEditorProps) {
  const [editing, setEditing] = useState<ContactMethod | null>(null);
  const [error, setError] = useState('');
  const addedTypes = new Set(methods.map((method) => method.type));

  function openNew(type: ContactMethodType) {
    if (addedTypes.has(type)) return;
    setError('');
    setEditing({ id: createMethodId(), type, value: '', label: METHOD_META[type].label });
  }

  function openExisting(method: ContactMethod) {
    setError('');
    setEditing({ ...method });
  }

  function closeSheet() {
    setEditing(null);
    setError('');
  }

  async function saveEditing() {
    if (!editing) return;
    const validation = validateMethod(editing);
    if (validation) {
      setError(validation);
      return;
    }
    const exists = methods.some((item) => item.id === editing.id);
    const next = exists
      ? methods.map((item) => (item.id === editing.id ? editing : item))
      : [...methods, editing];
    onChange(next);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeSheet();
  }

  function moveMethod(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= methods.length) return;
    const next = [...methods];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
    void Haptics.selectionAsync();
  }

  return (
    <View style={styles.wrap}>
      {methods.length ? (
        <View style={styles.list}>
          <Text style={styles.listHint}>Press and drag ↕ to reorder. Tap a row to edit.</Text>
          {methods.map((method, index) => (
            <MethodRow
              key={method.id}
              method={method}
              index={index}
              total={methods.length}
              onOpen={() => openExisting(method)}
              onRemove={() => onChange(methods.filter((item) => item.id !== method.id))}
              onMove={moveMethod}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Add at least one way people can reach you.</Text>
      )}

      {METHOD_CATEGORIES.map((category) => (
        <View key={category} style={styles.category}>
          <Text style={styles.categoryTitle}>{category}</Text>
          <View style={styles.pickerRow}>
            {methodsForCategory(category).map((type) => {
              const added = addedTypes.has(type);
              return (
                <Pressable
                  key={type}
                  disabled={added}
                  onPress={() => openNew(type)}
                  style={[styles.chip, added && styles.chipAdded]}>
                  <Plus size={12} color={colors.ink} weight="bold" />
                  <Text style={styles.chipText}>{METHOD_META[type].name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <BottomSheet
        visible={Boolean(editing)}
        title={editing ? METHOD_META[editing.type].name : ''}
        onClose={closeSheet}
        footer={(
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button onPress={() => void saveEditing()}>Save</Button>
          </>
        )}>
        {editing ? (
          <>
            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>{fieldLabel(editing.type)}</Text>
              {editing.type === 'phone' || editing.type === 'whatsapp' ? (
                <PhoneInput
                  value={editing.value}
                  onChange={(value) => setEditing({ ...editing, value })}
                />
              ) : (
                <TextInput
                  value={editing.value}
                  onChangeText={(value) => setEditing({ ...editing, value })}
                  placeholder={METHOD_META[editing.type].placeholder}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  style={styles.sheetInput}
                />
              )}
            </View>
            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Button label</Text>
              <TextInput
                value={editing.label}
                onChangeText={(label) => setEditing({ ...editing, label })}
                style={styles.sheetInput}
              />
            </View>
            <View style={styles.suggestions}>
              {labelSuggestions(editing.type).map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => setEditing({ ...editing, label: suggestion })}
                  style={styles.suggestion}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.x5 },
  list: { gap: spacing.x2 },
  listHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  empty: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    paddingRight: spacing.x2,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  dragHandle: {
    width: 34,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, minWidth: 0 },
  rowBadge: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  rowBadgeText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rowValue: { marginTop: 2, color: colors.muted, fontSize: 12 },
  removeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  category: { gap: spacing.x2 },
  categoryTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  chipAdded: { opacity: 0.4 },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  sheetField: { gap: spacing.x2 },
  sheetLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  sheetInput: {
    minHeight: 52,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 16,
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  suggestionText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});

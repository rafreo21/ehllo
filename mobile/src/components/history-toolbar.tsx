import { MagnifyingGlass, SortAscending } from 'phosphor-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing, fonts } from '@/theme/tokens';

export function HistoryToolbar({
  query,
  placeholder,
  onChangeQuery,
  onPressSort,
}: {
  query: string;
  placeholder: string;
  onChangeQuery: (value: string) => void;
  onPressSort: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.searchField}>
        <MagnifyingGlass size={19} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sort history"
        hitSlop={4}
        onPress={onPressSort}
        style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}>
        <SortAscending size={21} color={colors.ink} weight="bold" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: spacing.x2,
  },
  searchField: {
    minWidth: 0,
    height: 48,
    flex: 1,
    paddingHorizontal: spacing.x3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { fontFamily: fonts.regular,
    minWidth: 0,
    flex: 1,
    paddingVertical: 0,
    color: colors.ink,
    fontSize: 15, },
  sortButton: {
    width: 48,
    height: 48,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
});

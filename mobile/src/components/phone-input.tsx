import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown } from 'phosphor-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { COUNTRIES, countryByIso, detectDefaultCountryIso } from '@/lib/phone/countries';
import {
  formatPhoneE164,
  parseStoredPhone,
  phonePlaceholder,
  type PhoneParts,
} from '@/lib/phone/format';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type PhoneInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PhoneInput({ label, value, onChange, placeholder }: PhoneInputProps) {
  const defaultIso = useMemo(() => detectDefaultCountryIso(), []);
  const [parts, setParts] = useState<PhoneParts>(() => parseStoredPhone(value, defaultIso));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  // parseStoredPhone can't always tell a short in-progress national number
  // apart from a bare dial code (it needs >=4 remaining digits to trust a
  // match), so round-tripping every keystroke through it corrupts the
  // number. Only re-parse when `value` changes for a reason other than our
  // own onChange echoing back - e.g. the initial fetched value.
  const lastEmitted = useRef<string | null>(value || null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    void Promise.resolve().then(() => setParts(parseStoredPhone(value, defaultIso)));
  }, [value, defaultIso]);

  function update(next: PhoneParts) {
    setParts(next);
    const formatted = formatPhoneE164(next);
    lastEmitted.current = formatted;
    onChange(formatted);
  }

  const country = countryByIso(parts.countryIso);
  const filtered = COUNTRIES.filter((entry) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return entry.name.toLowerCase().includes(needle)
      || entry.iso.toLowerCase().includes(needle)
      || entry.dialCode.includes(needle);
  });

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose country code"
          onPress={() => setPickerOpen(true)}
          style={styles.countryButton}>
          <Text style={styles.flag}>{country.flag}</Text>
          <Text style={styles.dialCode}>+{country.dialCode}</Text>
          <CaretDown size={12} color={colors.muted} weight="bold" />
        </Pressable>
        <TextInput
          value={parts.nationalNumber}
          onChangeText={(nationalNumber) => update({
            ...parts,
            nationalNumber: nationalNumber.replace(/[^\d\s()-]/g, ''),
          })}
          placeholder={placeholder || phonePlaceholder(country)}
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          autoComplete="tel"
          style={styles.input}
        />
      </View>

      <BottomSheet
        visible={pickerOpen}
        title="Country code"
        onClose={() => {
          setPickerOpen(false);
          setQuery('');
        }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search country"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={styles.search}
        />
        <View style={styles.countryList}>
          {filtered.map((entry) => (
            <Pressable
              key={entry.iso}
              accessibilityRole="button"
              onPress={() => {
                update({ ...parts, countryIso: entry.iso });
                setPickerOpen(false);
                setQuery('');
              }}
              style={[styles.countryRow, entry.iso === parts.countryIso && styles.countryRowActive]}>
              <Text style={styles.countryFlag}>{entry.flag}</Text>
              <View style={styles.countryCopy}>
                <Text style={styles.countryName}>{entry.name}</Text>
                <Text style={styles.countryMeta}>+{entry.dialCode}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.x2 },
  label: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.x2,
  },
  countryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.x3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
  },
  flag: { fontFamily: fonts.regular, fontSize: 18 },
  dialCode: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 16,
  },
  search: { fontFamily: fonts.regular,
    minHeight: 48,
    marginBottom: spacing.x3,
    paddingHorizontal: spacing.x4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15, },
  countryList: { gap: spacing.x1 },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingVertical: spacing.x3,
    borderRadius: radius.medium,
  },
  countryRowActive: { backgroundColor: colors.surfaceMuted },
  countryFlag: { fontFamily: fonts.regular, fontSize: 22, width: 30, textAlign: 'center' },
  countryCopy: { flex: 1 },
  countryName: { color: colors.ink, fontSize: 15, fontFamily: fonts.medium, fontWeight: '700' },
  countryMeta: { marginTop: 2, color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
});

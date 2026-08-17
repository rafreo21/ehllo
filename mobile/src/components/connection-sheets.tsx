import { ContactlessPayment, PencilSimpleLine, QrCode } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type ConnectionAddSheetProps = {
  visible: boolean;
  onClose: () => void;
  onAddManually: () => void;
  onScanQr: () => void;
};

export function ConnectionAddSheet({
  visible,
  onClose,
  onAddManually,
  onScanQr,
}: ConnectionAddSheetProps) {
  return (
    <BottomSheet visible={visible} title="Add connection" onClose={onClose}>
      <Body>Add someone you met by scanning their card or entering their details manually.</Body>
      <View style={styles.options}>
        <Pressable
          accessibilityRole="button"
          onPress={onScanQr}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
          <View style={styles.optionIcon}>
            <QrCode size={22} color={colors.ink} weight="bold" />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>Scan QR code</Text>
            <Text style={styles.optionSubtitle}>Scan an ehllo card to start a capture.</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onAddManually}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
          <View style={styles.optionIcon}>
            <PencilSimpleLine size={22} color={colors.ink} weight="bold" />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>Add manually</Text>
            <Text style={styles.optionSubtitle}>Save their name and contact details yourself.</Text>
          </View>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

type ConnectionSortSheetProps = {
  visible: boolean;
  sort: 'date' | 'az';
  onClose: () => void;
  onSelect: (sort: 'date' | 'az') => void;
};

export function ConnectionSortSheet({
  visible,
  sort,
  onClose,
  onSelect,
}: ConnectionSortSheetProps) {
  return (
    <BottomSheet visible={visible} title="Sort by" onClose={onClose}>
      <View style={styles.sortOptions}>
        <Button
          variant={sort === 'date' ? 'primary' : 'secondary'}
          onPress={() => {
            onSelect('date');
            onClose();
          }}>
          Last added
        </Button>
        <Button
          variant={sort === 'az' ? 'primary' : 'secondary'}
          onPress={() => {
            onSelect('az');
            onClose();
          }}>
          A–Z
        </Button>
      </View>
    </BottomSheet>
  );
}

type ConnectionManualAddSheetProps = {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: { name: string; email: string; role: string; company: string }) => void;
};

export function ConnectionManualAddSheet({
  visible,
  saving,
  onClose,
  onSave,
}: ConnectionManualAddSheetProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');

  useEffect(() => {
    if (!visible) {
      void Promise.resolve().then(() => {
        setName('');
        setEmail('');
        setRole('');
        setCompany('');
      });
    }
  }, [visible]);

  return (
    <BottomSheet visible={visible} title="Add manually" onClose={onClose}>
      <Body>Save someone to your connections. You can add more details later from their card.</Body>
      <View style={styles.form}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" />
        <Field label="Role" value={role} onChangeText={setRole} placeholder="Job title" />
        <Field label="Company" value={company} onChangeText={setCompany} placeholder="Company" />
      </View>
      <Button
        loading={saving}
        disabled={!name.trim()}
        onPress={() => onSave({ name, email, role, company })}>
        <ContactlessPayment size={18} color={colors.white} weight="bold" />
        Save connection
      </Button>
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        style={styles.fieldInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.x2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  optionPressed: { opacity: 0.84 },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.extrabold, fontWeight: '800' },
  optionSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  sortOptions: { gap: spacing.x2 },
  form: { gap: spacing.x3 },
  field: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.extrabold, fontWeight: '800', letterSpacing: 0.4 },
  fieldInput: {
    minHeight: 46,
    paddingHorizontal: spacing.x3,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
  },
});

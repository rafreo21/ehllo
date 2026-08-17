import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button, Body } from '@/components/ui';
import { channelLabel } from '@/features/follow-ups/action-links';
import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import {
  channelSupportsGroupFollowUp,
  type FollowUpAudienceChoice,
  type FollowUpParticipant,
} from '@/features/follow-ups/follow-up-participants';
import { isFollowUpChannel } from '@/features/follow-ups/follow-up-channels';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export type { FollowUpAudienceChoice } from '@/features/follow-ups/follow-up-participants';

type FollowUpAudienceSheetProps = {
  visible: boolean;
  item: FollowUpItem | null;
  participants: FollowUpParticipant[];
  onClose: () => void;
  onConfirm: (choice: FollowUpAudienceChoice) => void;
};

type Step = 'mode' | 'person';

export function FollowUpAudienceSheet({
  visible,
  item,
  participants,
  onClose,
  onConfirm,
}: FollowUpAudienceSheetProps) {
  const [step, setStep] = useState<Step>('mode');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    void Promise.resolve().then(() => {
      setStep('mode');
      setSelectedKey(participants[0]?.key ?? null);
    });
  }, [visible, item?.actionId, participants]);

  if (!item) return null;

  const channel = isFollowUpChannel(item.channel) ? item.channel : 'email';
  const supportsGroup = channelSupportsGroupFollowUp(channel);
  const channelName = channelLabel(channel);

  function closeSheet() {
    setStep('mode');
    onClose();
  }

  function chooseGroup() {
    if (supportsGroup) {
      onConfirm({ mode: 'group', participants });
      closeSheet();
      return;
    }
    setStep('person');
  }

  function chooseIndividual() {
    setStep('person');
  }

  function confirmPerson() {
    const selected = participants.find((person) => person.key === selectedKey);
    if (!selected) return;
    onConfirm({
      mode: 'individual',
      participants: [selected],
    });
    closeSheet();
  }

  const title = step === 'mode'
    ? 'Who is this follow-up for?'
    : `Choose who to ${channelName.toLowerCase()}`;

  return (
    <BottomSheet visible={visible} title={title} onClose={closeSheet}>
      {step === 'mode' ? (
        <>
          <Body>
            This conversation included {participants.length} people. Follow up with everyone together, or reach out to one person.
          </Body>
          <Button onPress={chooseGroup}>
            {supportsGroup ? 'Group follow-up' : `Group follow-up (${channelName} picks one person)`}
          </Button>
          <Button variant="secondary" onPress={chooseIndividual}>
            Individual follow-up
          </Button>
          <Button variant="ghost" onPress={closeSheet}>Not now</Button>
        </>
      ) : (
        <>
          <Body>
            {supportsGroup
              ? `Pick who should receive this ${channelName.toLowerCase()} follow-up.`
              : `${channelName} works one person at a time. Choose who to follow up with.`}
          </Body>
          <View style={styles.list}>
            {participants.map((person) => {
              const selected = person.key === selectedKey;
              return (
                <Pressable
                  key={person.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedKey(person.key)}
                  style={({ pressed }) => [
                    styles.personRow,
                    selected && styles.personRowSelected,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>{person.name.trim() || 'Guest'}</Text>
                    {person.email.includes('@') ? (
                      <Text style={styles.personEmail}>{person.email.trim()}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                </Pressable>
              );
            })}
          </View>
          <Button onPress={confirmPerson} disabled={!selectedKey}>
            Continue
          </Button>
          <Button variant="ghost" onPress={() => setStep('mode')}>Back</Button>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.x2 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  personRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: { opacity: 0.82 },
  personCopy: { flex: 1, gap: 2 },
  personName: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  personEmail: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600' },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.line,
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
});

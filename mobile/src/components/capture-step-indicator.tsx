import { Check } from 'phosphor-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, fonts } from '@/theme/tokens';

export const CAPTURE_STEPS = ['Interaction', 'Context', 'Follow-up'] as const;

export function CaptureStepIndicator({
  current,
  onStep,
}: {
  current: number;
  onStep: (index: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperTrack}>
        {CAPTURE_STEPS.map((label, index) => {
          const active = index === current;
          const done = index < current;
          const leftLineActive = index > 0 && current >= index;
          const rightLineActive = index < CAPTURE_STEPS.length - 1 && current > index;

          return (
            <View key={label} style={styles.stepperSegment}>
              <View style={[styles.stepperLine, index === 0 && styles.stepperLineHidden, leftLineActive && styles.stepperLineActive]} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onStep(index)}
                style={[
                  styles.stepperDot,
                  active && styles.stepperDotActive,
                  done && styles.stepperDotDone,
                ]}>
                {done ? (
                  <Check size={14} color={colors.ink} weight="bold" />
                ) : (
                  <Text style={[styles.stepperNum, active && styles.stepperNumActive]}>{index + 1}</Text>
                )}
              </Pressable>
              <View style={[styles.stepperLine, index === CAPTURE_STEPS.length - 1 && styles.stepperLineHidden, rightLineActive && styles.stepperLineActive]} />
            </View>
          );
        })}
      </View>
      <View style={styles.stepperLabels}>
        {CAPTURE_STEPS.map((label, index) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            onPress={() => onStep(index)}
            style={styles.stepperLabelCell}>
            <Text style={[styles.stepperLabel, index === current && styles.stepperLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { gap: spacing.x3 },
  stepperTrack: { flexDirection: 'row', alignItems: 'center' },
  stepperSegment: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepperLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.line,
    borderRadius: 1,
  },
  stepperLineHidden: { opacity: 0 },
  stepperLineActive: { backgroundColor: colors.accent },
  stepperDot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  stepperDotActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  stepperDotDone: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  stepperNum: { color: colors.muted, fontSize: 13, fontFamily: fonts.extrabold, fontWeight: '900' },
  stepperNumActive: { color: colors.white },
  stepperLabels: { flexDirection: 'row' },
  stepperLabelCell: { flex: 1, alignItems: 'center' },
  stepperLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontWeight: '800', textAlign: 'center' },
  stepperLabelActive: { color: colors.ink },
});

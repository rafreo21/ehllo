import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CardThemeGradientFill } from '@/components/card-theme-gradient';
import {
  cardDisplayLabel,
  cardInitials,
  cardLeadDetail,
} from '@/features/card/card-display';
import type { MobileCard } from '@/features/card/types';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type CardLibraryTileProps = {
  card: MobileCard;
  isPrimary: boolean;
  onPress: () => void;
};

export function CardLibraryTile({ card, isPrimary, onPress }: CardLibraryTileProps) {
  const initials = cardInitials(card.name);
  const label = cardDisplayLabel(card);
  const detail = cardLeadDetail(card);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.cardTile, pressed && styles.pressed]}>
      <View style={styles.coverWrap}>
        {card.coverPhoto ? (
          <Image alt="" source={card.coverPhoto} style={styles.coverImage} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.coverFallback}>
            <CardThemeGradientFill theme={card.theme} />
          </View>
        )}
        <View style={styles.avatar}>
          {card.photo ? (
            <Image alt={card.name || label} source={card.photo} style={styles.avatarImage} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.tileBody}>
        <Text style={styles.cardLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.cardName} numberOfLines={1}>
          {card.name.trim() || 'Add your full name'}
        </Text>
        <Text style={styles.cardDetail} numberOfLines={1}>{detail}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.cardStatus}>{card.status === 'published' ? 'Published' : 'Draft'}</Text>
          {isPrimary ? <Text style={styles.primaryBadge}>Primary</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardTile: {
    overflow: 'hidden',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.92 },
  coverWrap: {
    height: 96,
    backgroundColor: colors.surfaceMuted,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  avatar: {
    position: 'absolute',
    left: spacing.x4,
    bottom: -24,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  avatarText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: fonts.extrabold, fontWeight: '900',
  },
  tileBody: {
    paddingHorizontal: spacing.x4,
    paddingTop: spacing.x6 + 4,
    paddingBottom: spacing.x4,
    gap: 2,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: fonts.extrabold, fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardName: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.bold, fontWeight: '800',
  },
  cardDetail: { fontFamily: fonts.regular,
    color: colors.muted,
    fontSize: 13, },
  metaRow: {
    marginTop: spacing.x2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x2,
  },
  cardStatus: {
    color: colors.inkSoft,
    fontSize: 11,
    fontFamily: fonts.medium, fontWeight: '700',
  },
  primaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    color: colors.ink,
    fontSize: 10,
    fontFamily: fonts.extrabold, fontWeight: '900',
    overflow: 'hidden',
  },
});

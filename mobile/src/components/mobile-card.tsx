import { Image } from 'expo-image';
import { ArrowUpRight } from 'phosphor-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CardThemeGradient, CardThemeGradientFill } from '@/components/card-theme-gradient';
import { ContactMethodIcon } from '@/components/contact-method-icon';
import { openContactMethod } from '@/features/card/contact-actions';
import { cardWithCompanyVisibility, showsCompanyDetails } from '@/features/card/company-display';
import type { MobileCard } from '@/features/card/types';
import { themeCoverBadgeStyle, themeForegroundColor } from '@/features/card/theme-colors';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export function MobileCardPreview({ card, compact = false }: { card: MobileCard; compact?: boolean }) {
  const visible = cardWithCompanyVisibility(card);
  const showCompany = showsCompanyDetails(card);
  const onTheme = themeForegroundColor(visible.theme);
  const coverBadge = themeCoverBadgeStyle(visible.theme);
  const initials = visible.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={styles.card}>
      <View style={styles.cover}>
        {!visible.coverPhoto ? <CardThemeGradientFill theme={visible.theme} /> : null}
        {visible.coverPhoto ? <Image alt="" source={visible.coverPhoto} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
        {showCompany && (visible.companyLogo || visible.company) ? (
          <View style={styles.companyRow}>
            <View style={[styles.logo, { backgroundColor: coverBadge.backgroundColor }]}>
              {visible.companyLogo ? (
                <Image alt={`${visible.company} logo`} source={visible.companyLogo} style={styles.fill} transition={200} />
              ) : (
                <Text style={[styles.logoText, { color: coverBadge.color }]}>{visible.company[0] || 'A'}</Text>
              )}
            </View>
            {visible.company ? <Text style={[styles.company, { color: onTheme }]}>{visible.company}</Text> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.avatar}>{visible.photo ? <Image alt={visible.name} source={visible.photo} style={styles.fill} transition={200} /> : <Text style={styles.avatarText}>{initials}</Text>}</View>
        <Text style={styles.name}>{visible.name}</Text>
        <Text style={styles.role}>{visible.role}{visible.company ? ` · ${visible.company}` : ''}</Text>
        {!compact && visible.bio ? <Text style={styles.bio}>{visible.bio}</Text> : null}
        <View style={styles.methods}>
          {visible.methods.slice(0, compact ? 2 : undefined).map((method) => (
              <Pressable key={method.id} onPress={() => openContactMethod(method)} style={({ pressed }) => [styles.method, pressed && styles.pressed]}>
                <CardThemeGradient theme={visible.theme} style={styles.methodIcon}>
                  <ContactMethodIcon type={method.type} size={18} color={onTheme} />
                </CardThemeGradient>
                <View style={styles.methodCopy}><Text style={styles.methodLabel}>{method.label}</Text><Text numberOfLines={1} style={styles.methodValue}>{method.value}</Text></View>
                <ArrowUpRight size={17} color={colors.muted} />
              </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radius.large, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  cover: { height: 138, overflow: 'hidden', padding: spacing.x5, justifyContent: 'flex-start' },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.x2 },
  logo: { width: 34, height: 34, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: radius.round },
  logoText: { fontFamily: fonts.extrabold, fontWeight: '900' },
  company: { fontFamily: fonts.bold, fontWeight: '800' },
  body: { padding: spacing.x5, paddingTop: 42 },
  avatar: { position: 'absolute', top: -34, left: spacing.x5, width: 68, height: 68, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.surface, borderRadius: radius.round, backgroundColor: colors.ink },
  avatarText: { color: colors.white, fontSize: 20, fontFamily: fonts.extrabold, fontWeight: '900' },
  fill: { width: '100%', height: '100%' },
  name: { color: colors.ink, fontSize: 26, fontFamily: fonts.bold, fontWeight: '800', letterSpacing: -0.7 },
  role: { marginTop: 3, color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  bio: { marginTop: spacing.x4, color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  methods: { marginTop: spacing.x5, gap: spacing.x2 },
  method: { minHeight: 56, padding: spacing.x2, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, borderRadius: radius.medium, backgroundColor: colors.surfaceMuted },
  methodIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.round },
  methodCopy: { flex: 1, minWidth: 0 },
  methodLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold, fontWeight: '800' },
  methodValue: { marginTop: 2, color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  pressed: { opacity: 0.7 },
});

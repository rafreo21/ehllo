import { StyleSheet, Text, View } from 'react-native';

import type { MobileCard } from '@/features/card/types';
import { BrandedQrPreview } from '@/components/branded-qr-preview';
import { showsCompanyDetails } from '@/features/card/company-display';
import { colors, fonts } from '@/theme/tokens';

type VirtualBackgroundPanelPreviewProps = {
  card: MobileCard;
  cardUrl: string;
  panelWidth?: number;
};

/** Side-by-side panel: copy left, branded QR right, scan line bottom-left. */
export function VirtualBackgroundPanelPreview({
  card,
  cardUrl,
  panelWidth = 240,
}: VirtualBackgroundPanelPreviewProps) {
  const scale = panelWidth / 360;
  const pad = Math.round(28 * scale);
  const qrSize = Math.max(56, Math.round(120 * scale));
  const panelHeight = Math.round(168 * scale);
  const nameFontSize = Math.max(12, Math.round(28 * scale));
  const subtitleFontSize = Math.max(10, Math.round(18 * scale));
  const scanFontSize = Math.max(9, Math.round(14 * scale));
  const subtitle = [card.role, showsCompanyDetails(card) ? card.company : ''].filter(Boolean).join(' · ');

  return (
    <View style={[styles.panel, { width: panelWidth, minHeight: panelHeight, padding: pad }]}>
      <View style={styles.row}>
        <View style={[styles.copy, { minHeight: qrSize }]}>
          <View style={styles.heading}>
            <Text style={[styles.name, { fontFamily: fonts.regular, fontSize: nameFontSize }]} numberOfLines={2}>
              {card.name}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { fontFamily: fonts.regular, fontSize: subtitleFontSize }]} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.scanLabel, { fontFamily: fonts.regular, fontSize: scanFontSize }]}>
            Scan to save my contact
          </Text>
        </View>
        <View style={styles.qr}>
          <BrandedQrPreview card={card} cardUrl={cardUrl} size={qrSize} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copy: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 8,
  },
  heading: {
    gap: 2,
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.extrabold, fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
  },
  qr: {
    borderRadius: 10,
    flexShrink: 0,
  },
  scanLabel: {
    color: colors.muted,
    fontFamily: fonts.semibold, fontWeight: '600',
  },
});

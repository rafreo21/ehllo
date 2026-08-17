import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { MobileCard } from '@/features/card/types';
import { describeError } from '@/lib/friendly-error';
import { buildOfflineQrPayload, tryBuildOfflineQrPayloadWithPhoto, type OfflineQrPayload } from '@/lib/offline-qr-payload';
import { QR_LOGO } from '@/lib/widget-qr';
import { colors, fonts } from '@/theme/tokens';

export type QrShareMode = 'online' | 'offline';

type BrandedQrCodeProps = {
  /** Card page URL — default QR payload for online visitor flow. */
  cardUrl?: string;
  value?: string;
  /** Required only for offline contact QR mode. */
  card?: MobileCard;
  mode?: QrShareMode;
  size?: number;
  style?: ViewStyle;
  color?: string;
  backgroundColor?: string;
  /** The sharer's currently-happening event, if any — offline mode only, an activator. */
  activeEventTitle?: string;
};

function resolvePayload({ value, card, cardUrl, mode = 'online', activeEventTitle }: BrandedQrCodeProps) {
  if (mode === 'offline') {
    if (card && cardUrl?.trim()) {
      return buildOfflineQrPayload(card, cardUrl.trim(), activeEventTitle);
    }
    const fallback = value?.trim() ?? '';
    return fallback ? { payload: fallback, tier: 'minimal' as const, ecl: 'M' as const } : null;
  }

  const payload = cardUrl?.trim() || value?.trim() || '';
  return payload ? { payload, tier: 'full' as const, ecl: 'H' as const } : null;
}

export function BrandedQrCode({
  value,
  card,
  cardUrl,
  mode = 'online',
  size = 120,
  style,
  color = colors.ink,
  backgroundColor = colors.white,
  activeEventTitle,
}: BrandedQrCodeProps) {
  const resolved = useMemo(
    () => resolvePayload({ value, card, cardUrl, mode, activeEventTitle }),
    [value, card, cardUrl, mode, activeEventTitle],
  );
  const [renderError, setRenderError] = useState('');
  const [enhanced, setEnhanced] = useState<{ key: string; result: OfflineQrPayload } | null>(null);
  const enhanceKey = `${mode}:${card?.id ?? ''}:${cardUrl ?? ''}:${activeEventTitle ?? ''}`;

  useEffect(() => {
    void Promise.resolve().then(() => setRenderError(''));
  }, [resolved?.payload, resolved?.ecl]);

  useEffect(() => {
    if (mode !== 'offline' || !card || !cardUrl?.trim()) return;

    let cancelled = false;
    void tryBuildOfflineQrPayloadWithPhoto(card, cardUrl.trim(), activeEventTitle).then((result) => {
      if (!cancelled && result) setEnhanced({ key: enhanceKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, card, cardUrl, enhanceKey, activeEventTitle]);

  const active = (enhanced?.key === enhanceKey ? enhanced.result : null) ?? resolved;

  if (!active?.payload) {
    return (
      <View style={[styles.frame, { width: size, height: size }, style]}>
        <Text style={styles.placeholder}>QR</Text>
      </View>
    );
  }

  if (renderError) {
    return (
      <View style={[styles.frame, styles.errorFrame, { width: size, height: size }, style]}>
        <Text style={styles.errorText}>{renderError}</Text>
      </View>
    );
  }

  const logoSize = Math.max(14, Math.round(size * 0.22));
  const badgeSize = logoSize + 8;
  // Offline QR uses ECC 'Q'/'H' (see offline-qr-payload.ts) specifically so the
  // logo's center occlusion stays safely within the error-correction budget.
  const showLogo = true;

  return (
    <View style={[styles.frame, { width: size, height: size }, style]}>
      <QRCode
        key={`${active.payload}:${active.ecl}:${showLogo ? 'logo' : 'plain'}`}
        value={active.payload}
        size={size}
        color={color}
        backgroundColor={backgroundColor}
        ecl={active.ecl}
        onError={(error: unknown) => {
          setRenderError(describeError(error, 'Could not render this QR code.'));
        }}
      />
      {showLogo ? (
        <View
          pointerEvents="none"
          style={[
            styles.logoBadge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: Math.round(badgeSize * 0.22),
              left: (size - badgeSize) / 2,
              top: (size - badgeSize) / 2,
            },
          ]}>
          <Image
            source={QR_LOGO}
            style={{ width: logoSize, height: logoSize, borderRadius: Math.round(logoSize * 0.22) }}
            contentFit="contain"
            accessibilityLabel="ehllo"
            alt="ehllo"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  logoBadge: {
    position: 'absolute',
    zIndex: 2,
    elevation: 2,
    overflow: 'hidden',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.bold, fontWeight: '800',
  },
  errorFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  errorText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: fonts.semibold, fontWeight: '600',
  },
});

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme/tokens';

type SkeletonProps = {
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ style }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.95, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 850, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View style={[styles.bone, { opacity }, style]} />;
}

export function SkeletonCircle({ size }: { size: number }) {
  return <Skeleton style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

export function SkeletonLine({ width, height = 12 }: { width: number | `${number}%`; height?: number }) {
  return <Skeleton style={{ width, height, borderRadius: height / 2 }} />;
}

export function ConnectionRowSkeleton() {
  return (
    <View style={styles.connectionRow}>
      <SkeletonCircle size={44} />
      <View style={styles.connectionCopy}>
        <SkeletonLine width="58%" height={14} />
        <SkeletonLine width="42%" height={11} />
        <View style={styles.connectionMeta}>
          <SkeletonLine width={72} height={10} />
          <SkeletonLine width={48} height={10} />
        </View>
      </View>
      <Skeleton style={{ width: 16, height: 16, borderRadius: 8 }} />
    </View>
  );
}

export function ConnectionsListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <ConnectionRowSkeleton key={index} />
      ))}
    </View>
  );
}

export function ConnectionsHeaderSkeleton() {
  return (
    <View style={styles.headerSkeleton}>
      <SkeletonLine width={120} height={10} />
      <SkeletonLine width="72%" height={28} />
      <SkeletonLine width="100%" height={12} />
      <SkeletonLine width="88%" height={12} />
      <View style={styles.searchRowSkeleton}>
        <Skeleton style={styles.searchFieldSkeleton} />
        <Skeleton style={styles.sortButtonSkeleton} />
      </View>
    </View>
  );
}

export function ConnectionDetailSkeleton() {
  return (
    <View style={styles.detailWrap}>
      <SkeletonLine width={100} height={10} />
      <SkeletonLine width="80%" height={12} />
      <Skeleton style={styles.cardPreviewSkeleton} />
      <Skeleton style={styles.buttonSkeleton} />
    </View>
  );
}

export function CaptureListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.captureCard}>
          <SkeletonLine width="64%" height={16} />
          <SkeletonLine width="38%" height={11} />
          <SkeletonLine width="92%" height={11} />
        </View>
      ))}
    </View>
  );
}

export function SettingsSkeleton() {
  return (
    <View style={styles.settingsWrap}>
      <SkeletonLine width={120} height={10} />
      <SkeletonLine width="48%" height={28} />
      <SkeletonLine width="100%" height={12} />
      <Skeleton style={styles.settingsPanel} />
      <Skeleton style={styles.settingsPanel} />
      <Skeleton style={styles.settingsButton} />
    </View>
  );
}

export function CardGridSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.cardGrid}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} style={styles.cardTileSkeleton} />
      ))}
    </View>
  );
}

export function PendingSyncSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.pendingRow}>
          <SkeletonCircle size={38} />
          <View style={styles.pendingRowCopy}>
            <SkeletonLine width="46%" height={13} />
            <SkeletonLine width="72%" height={11} />
          </View>
          <Skeleton style={styles.pendingRowCount} />
        </View>
      ))}
    </View>
  );
}

export function ScanShareSkeleton() {
  return (
    <View style={styles.scanWrap}>
      <SkeletonLine width={100} height={10} />
      <SkeletonLine width="70%" height={24} />
      <Skeleton style={styles.scanHero} />
      <Skeleton style={styles.scanPanel} />
    </View>
  );
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: colors.surfaceMuted,
  },
  list: { gap: 8 },
  connectionRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  connectionCopy: { flex: 1, gap: 6 },
  connectionMeta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  headerSkeleton: { gap: 10 },
  searchRowSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  searchFieldSkeleton: { flex: 1, height: 46, borderRadius: radius.medium },
  sortButtonSkeleton: { width: 46, height: 46, borderRadius: radius.medium },
  detailWrap: { gap: 12 },
  cardPreviewSkeleton: {
    width: '100%',
    height: 420,
    borderRadius: radius.large,
  },
  buttonSkeleton: {
    width: '100%',
    height: 48,
    borderRadius: radius.medium,
  },
  captureCard: {
    gap: 8,
    padding: 16,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  settingsWrap: { gap: 12, paddingTop: 20 },
  settingsPanel: {
    width: '100%',
    height: 88,
    borderRadius: radius.large,
  },
  settingsButton: {
    width: '100%',
    height: 48,
    borderRadius: radius.medium,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardTileSkeleton: {
    width: '48%',
    height: 180,
    borderRadius: radius.large,
  },
  pendingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  pendingRowCopy: { flex: 1, minWidth: 0, gap: 6 },
  pendingRowCount: { width: 28, height: 28, borderRadius: 14 },
  scanWrap: { gap: 12 },
  scanHero: {
    width: '100%',
    height: 160,
    borderRadius: radius.large,
  },
  scanPanel: {
    width: '100%',
    height: 280,
    borderRadius: radius.large,
  },
});

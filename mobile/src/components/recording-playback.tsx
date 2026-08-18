import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/features/encounters/local-recordings';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

type RecordingPlaybackProps = {
  uri: string;
  durationSeconds?: number;
  variant?: 'full' | 'compact';
};

export function RecordingPlayOrb({
  uri,
  durationSeconds = 0,
  size = 44,
}: {
  uri: string;
  durationSeconds?: number;
  size?: number;
}) {
  const player = useAudioPlayer(uri || null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!uri) return;
    try {
      player.replace(uri);
    } catch {
      // ignore load errors in compact control
    }
  }, [player, uri]);

  const togglePlayback = useCallback(() => {
    if (!uri) return;
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      player.replace(uri);
      player.play();
    } catch {
      // ignore playback errors in compact control
    }
  }, [player, status.playing, uri]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Pause recording' : 'Play recording'}
      accessibilityHint={durationSeconds > 0 ? `Recording length ${formatDuration(durationSeconds)}` : undefined}
      onPress={togglePlayback}
      style={({ pressed }) => [
        styles.playOrb,
        { width: size, height: size, borderRadius: size / 2 },
        status.playing && styles.playOrbActive,
        pressed && styles.playOrbPressed,
      ]}>
      {status.playing ? (
        <Pause size={size * 0.45} color={colors.white} weight="fill" />
      ) : (
        <Play size={size * 0.45} color={colors.ink} weight="fill" />
      )}
    </Pressable>
  );
}

export function RecordingPlayback({ uri, durationSeconds = 0, variant = 'full' }: RecordingPlaybackProps) {
  const player = useAudioPlayer(uri || null);
  const status = useAudioPlayerStatus(player);
  const [playbackError, setPlaybackError] = useState('');

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!uri) return;
    void Promise.resolve().then(() => setPlaybackError(''));
    try {
      player.replace(uri);
    } catch {
      void Promise.resolve().then(() => setPlaybackError('Could not load this recording.'));
    }
  }, [player, uri]);

  const togglePlayback = useCallback(() => {
    if (!uri) return;
    setPlaybackError('');
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      player.replace(uri);
      player.play();
    } catch {
      setPlaybackError('Could not play this recording on your device.');
    }
  }, [player, status.playing, uri]);

  const elapsed = Math.max(0, Math.round(status.currentTime || 0));
  const total = Math.max(durationSeconds, Math.round(status.duration || 0), elapsed);
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;
  const timeLabel = status.playing || (status.isLoaded && elapsed > 0 && elapsed < total)
    ? `${formatDuration(elapsed)} / ${formatDuration(total)}`
    : formatDuration(total);

  const statusLabel = useMemo(() => {
    if (playbackError) return playbackError;
    if (!uri) return 'No recording available';
    if (status.playing) return 'Playing…';
    if (status.isLoaded && elapsed > 0 && elapsed < total) return 'Paused';
    return 'Ready to play';
  }, [elapsed, playbackError, status.isLoaded, status.playing, total, uri]);

  if (variant === 'compact') {
    return (
      <View style={styles.compactRow}>
        <RecordingPlayOrb uri={uri} durationSeconds={durationSeconds} />
        <View style={styles.compactCopy}>
          <Text style={styles.label}>Voice recording</Text>
          <Text style={styles.status}>{statusLabel}</Text>
        </View>
        <Text style={styles.duration}>{timeLabel}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.label}>Voice recording</Text>
        <Text style={[styles.status, status.playing && styles.statusActive]}>{statusLabel}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause recording' : 'Play recording'}
        onPress={togglePlayback}
        style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}>
        {status.playing ? (
          <Pause size={22} color={colors.ink} weight="fill" />
        ) : (
          <Play size={22} color={colors.ink} weight="fill" />
        )}
        <Text style={styles.playLabel}>{status.playing ? 'Pause' : 'Play recording'}</Text>
      </Pressable>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={styles.duration}>
        {formatDuration(elapsed)} / {formatDuration(total)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.x3,
    padding: spacing.x4,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  head: { gap: 4 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.bold, fontWeight: '800',
  },
  status: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  statusActive: { color: colors.ink, fontFamily: fonts.medium, fontWeight: '700' },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x2,
    minHeight: 48,
    borderRadius: radius.small,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  playButtonPressed: { opacity: 0.86 },
  playLabel: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, fontWeight: '800' },
  progressTrack: {
    height: 6,
    borderRadius: radius.round,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.round,
    backgroundColor: colors.accent,
  },
  duration: { color: colors.ink, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
  },
  compactCopy: { flex: 1, gap: 2 },
  playOrb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  playOrbActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  playOrbPressed: { opacity: 0.86 },
});

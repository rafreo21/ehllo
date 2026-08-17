import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { reportClientError } from '@/lib/client-error-reporting';
import { colors, spacing, fonts } from '@/theme/tokens';

type Props = PropsWithChildren<{
  onReset?: () => void;
}>;

type State = {
  error: Error | null;
};

export class CaptureErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Capture screen crashed:', error, info.componentStack);
    void reportClientError({
      route: '/capture',
      message: error.message || 'Capture screen crashed',
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Capture could not open</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Button onPress={this.reset}>Try again</Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.x4,
    padding: spacing.x5,
    backgroundColor: colors.canvas,
  },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.bold, fontWeight: '800' },
  message: { color: colors.danger, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
});

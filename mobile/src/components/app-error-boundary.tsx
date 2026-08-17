import * as Sentry from '@sentry/react-native';
import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { reportClientError } from '@/lib/client-error-reporting';
import { colors, spacing, fonts } from '@/theme/tokens';

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Mobile app crashed:', error, info.componentStack);
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
    void reportClientError({
      route: 'app-root',
      message: error.message || 'Mobile app crashed',
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap} accessibilityRole="alert">
          <Text style={styles.title}>ehllo needs to reopen this screen</Text>
          <Text style={styles.message}>
            Your saved work is still on this device. Try again to return to the app.
          </Text>
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
  message: { color: colors.muted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
});

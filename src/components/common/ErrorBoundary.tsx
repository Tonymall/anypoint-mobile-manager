// ============================================================
// Error Boundary - Catches runtime errors and shows recovery UI
// Must be a class component (React requirement for error boundaries)
// ============================================================

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// ── Fallback UI (functional, uses theme-independent colors) ──
const ErrorFallback: React.FC<{
  error: Error | null;
  onReset: () => void;
}> = ({ error, onReset }) => (
  <View style={fallbackStyles.container}>
    <View style={fallbackStyles.iconCircle}>
      <Icon name="alert-circle-outline" size={48} color="#EF4444" />
    </View>
    <Text style={fallbackStyles.title}>Something went wrong</Text>
    <Text style={fallbackStyles.message}>
      {error?.message ?? 'An unexpected error occurred.'}
    </Text>
    <Button
      mode="contained"
      onPress={onReset}
      icon="refresh"
      style={fallbackStyles.button}
      buttonColor="#00A1E0"
      textColor="#FFFFFF"
      accessibilityLabel="Try again to recover from error"
      accessibilityRole="button"
    >
      Try Again
    </Button>
  </View>
);

const fallbackStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#0B0F19',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#EF444414',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 320,
    lineHeight: 20,
  },
  button: {
    borderRadius: 14,
  },
});

// ── Error Boundary (class component) ──
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Production: log only the error name/message (no stack traces or component trees)
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error.name, error.message);
    // Full stack in dev only
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] Component stack:', info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

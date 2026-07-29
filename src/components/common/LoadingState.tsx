// ============================================================
// LoadingState — spinner fallback
// ============================================================
// Prefer a Skeleton shaped like the incoming content; this remains for
// the cases where nothing is known about what is arriving.
// Built on the design token layer.
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

import { spacing, typeScale, useTokens } from '../../theme';

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
  size?: 'small' | 'large';
}

const LoadingState: React.FC<LoadingStateProps> = ({
  message,
  fullScreen = true,
  size = 'large',
}) => {
  const t = useTokens();

  return (
    <View
      style={[
        styles.container,
        fullScreen && styles.fullScreen,
        { backgroundColor: fullScreen ? t.color.surface.canvas : 'transparent' },
      ]}
    >
      <ActivityIndicator
        animating
        size={size}
        color={t.color.brand.base}
      />
      {message && (
        <Text style={[styles.message, { color: t.color.text.secondary }]}>
          {message}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  fullScreen: {
    flex: 1,
  },
  message: {
    ...typeScale.body,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});

export default LoadingState;

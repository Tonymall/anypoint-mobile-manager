// ═══════════════════════════════════════════════════════════════════
// Skeleton — loading placeholder
// ═══════════════════════════════════════════════════════════════════
// Replaces the "—" and bare spinners that were standing in for content.
// A shape that matches what is coming reads as "loading" without a
// layout jump when the data lands.
// ═══════════════════════════════════════════════════════════════════

import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radii, spacing, useTokens, withAlpha } from '../../theme';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton = memo(function Skeleton({
  width = '100%',
  height = 14,
  radius = radii.sm,
  style,
}: SkeletonProps) {
  const t = useTokens();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: withAlpha(t.color.text.primary, 0.08),
        },
        animatedStyle,
        style,
      ]}
    />
  );
});

/** A few stacked lines, for text blocks. */
export const SkeletonLines = memo(function SkeletonLines({
  count = 3,
  lastLineWidth = '60%',
}: {
  count?: number;
  lastLineWidth?: `${number}%`;
}) {
  return (
    <View style={styles.lines}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          width={i === count - 1 ? lastLineWidth : '100%'}
          height={12}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  lines: {
    gap: spacing.sm,
  },
});

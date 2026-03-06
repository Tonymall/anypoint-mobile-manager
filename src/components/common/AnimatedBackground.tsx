// ============================================================
// Animated Background — floating gradient orbs
// 2026 Design: deeper, more vibrant gradient blurs
// Uses react-native-reanimated for smooth 60fps animations.
// ============================================================

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from 'react-native-paper';

interface OrbConfig {
  size: number;
  startX: number;
  startY: number;
  colors: string[];
  duration: number;
  delay: number;
  moveX: number;
  moveY: number;
  maxOpacity: number;
}

const Orb: React.FC<{ config: OrbConfig }> = ({ config }) => {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Fade in
    opacity.value = withDelay(
      config.delay,
      withTiming(1, { duration: 2500, easing: Easing.ease }),
    );
    // Move in a loop
    progress.value = withDelay(
      config.delay,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: config.duration,
            easing: Easing.bezier(0.45, 0.05, 0.55, 0.95),
          }),
          withTiming(0, {
            duration: config.duration,
            easing: Easing.bezier(0.45, 0.05, 0.55, 0.95),
          }),
        ),
        -1, // infinite
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run-once animation setup; config/opacity/progress are stable Reanimated values
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value * config.maxOpacity,
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 0.5, 1],
          [0, config.moveX, 0],
        ),
      },
      {
        translateY: interpolate(
          progress.value,
          [0, 0.5, 1],
          [0, config.moveY, 0],
        ),
      },
      {
        scale: interpolate(progress.value, [0, 0.5, 1], [1, 1.12, 1]),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: config.startX,
          top: config.startY,
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          overflow: 'hidden',
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={config.colors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

const AnimatedBackground: React.FC = () => {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();

  const orbs = useMemo<OrbConfig[]>(() => {
    const isDark = theme.dark;
    // Deeper, more vibrant colors for dark mode — subtler for light
    const baseColors = isDark
      ? [
          ['#00A1E050', '#0078B840', '#00A1E015'],  // Primary blue
          ['#818CF840', '#6366F130', '#818CF815'],  // Indigo
          ['#34D39935', '#22C55E28', '#34D39912'],  // Emerald
          ['#00A1E030', '#4DC9F620', '#00A1E00A'],  // Light blue
        ]
      : [
          ['#00A1E020', '#0078B815', '#00A1E008'],
          ['#6366F115', '#818CF810', '#6366F106'],
          ['#34D39912', '#22C55E10', '#34D39906'],
          ['#00A1E010', '#4DC9F608', '#00A1E004'],
        ];

    return [
      {
        size: Math.max(width, height) * 0.55,
        startX: -width * 0.15,
        startY: -height * 0.1,
        colors: baseColors[0],
        duration: 12000,
        delay: 0,
        moveX: width * 0.08,
        moveY: height * 0.06,
        maxOpacity: isDark ? 0.4 : 0.35,
      },
      {
        size: Math.max(width, height) * 0.42,
        startX: width * 0.55,
        startY: height * 0.12,
        colors: baseColors[1],
        duration: 15000,
        delay: 800,
        moveX: -width * 0.06,
        moveY: height * 0.08,
        maxOpacity: isDark ? 0.35 : 0.3,
      },
      {
        size: Math.max(width, height) * 0.38,
        startX: width * 0.18,
        startY: height * 0.55,
        colors: baseColors[2],
        duration: 18000,
        delay: 1600,
        moveX: width * 0.1,
        moveY: -height * 0.05,
        maxOpacity: isDark ? 0.3 : 0.25,
      },
      {
        size: Math.max(width, height) * 0.32,
        startX: width * 0.65,
        startY: height * 0.65,
        colors: baseColors[3],
        duration: 14000,
        delay: 2400,
        moveX: -width * 0.07,
        moveY: -height * 0.06,
        maxOpacity: isDark ? 0.25 : 0.2,
      },
    ];
  }, [width, height, theme.dark]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {orbs.map((orb, i) => (
        <Orb key={i} config={orb} />
      ))}
    </View>
  );
};

export default AnimatedBackground;

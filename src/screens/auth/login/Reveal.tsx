// ============================================================
// Login — Reveal
// ============================================================
// Staggered entrance for the login screen's three bands (brand
// lockup, form card, secondary paths). Fades and lifts once on
// mount; honours the OS "reduce motion" setting by rendering the
// settled state immediately.
// ============================================================

import React, { memo, useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '../../../theme';

/** How far the band travels up into place, in points. */
const TRAVEL = 14;

const EASING = Easing.bezier(0.22, 1, 0.36, 1);

export interface RevealProps {
  children: ReactNode;
  /** Milliseconds to hold before this band animates in. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

function Reveal({ children, delay = 0, style }: RevealProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: motion.duration.settled, easing: EASING }),
    );
  }, [delay, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * TRAVEL }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export default memo(Reveal);

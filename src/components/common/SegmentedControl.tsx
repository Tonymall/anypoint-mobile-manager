// ============================================================
// Segmented Control — Shared inline tab switcher
//
// Animated pill indicator that matches the app's tab bar style.
// Used inside Runtime, APIs, and Alerts for sub-navigation.
// ============================================================

import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { hapticLight } from '../../utils/haptics';
import { radii, spacing, typeScale, useTokens } from '../../theme';

export interface Segment {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  activeKey: string;
  onChange: (key: string) => void;
}

const ANIMATION_CONFIG = { duration: 250, easing: Easing.bezier(0.33, 0, 0, 1) };

const SegmentedControl: React.FC<SegmentedControlProps> = ({
  segments,
  activeKey,
  onChange,
}) => {
  const t = useTokens();
  const containerWidth = useSharedValue(0);
  const segmentCount = segments.length;
  const activeIndex = useMemo(
    () => Math.max(0, segments.findIndex((s) => s.key === activeKey)),
    [segments, activeKey],
  );

  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (containerWidth.value > 0) {
      const segWidth = containerWidth.value / segmentCount;
      indicatorX.value = withTiming(activeIndex * segWidth, ANIMATION_CONFIG);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indicatorX is a stable Reanimated SharedValue
  }, [activeIndex, segmentCount, containerWidth]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      containerWidth.value = w;
      const segWidth = w / segmentCount;
      indicatorX.value = activeIndex * segWidth;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- SharedValues are stable refs
    [segmentCount, activeIndex],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    width: containerWidth.value / segmentCount,
    transform: [{ translateX: indicatorX.value }],
  }));

  const handlePress = useCallback(
    (key: string) => {
      hapticLight();
      onChange(key);
    },
    [onChange],
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        {
          backgroundColor: t.color.surface.sunken,
          borderColor: t.color.border.subtle,
        },
      ]}
    >
      {/* Animated pill indicator */}
      <Animated.View
        style={[
          styles.indicator,
          indicatorStyle,
          { backgroundColor: t.color.surface.raised, shadowColor: t.color.shadow },
        ]}
      />

      {/* Segment buttons */}
      {segments.map((segment) => {
        const isActive = segment.key === activeKey;
        return (
          <Pressable
            key={segment.key}
            onPress={() => handlePress(segment.key)}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={segment.label}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isActive ? t.color.text.accent : t.color.text.tertiary,
                  fontWeight: isActive ? '700' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 3,
    position: 'relative',
    height: 40,
  },
  indicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: radii.sm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segment: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  label: { ...typeScale.label, textAlign: 'center' },
});

export default SegmentedControl;

// ============================================================
// Login — Primary action
// ============================================================
// The old Sign In button read as disabled even when it was live:
// Paper's contained button on this theme lands close to the card
// surface. This one is unambiguous — a saturated brand fill with a
// near-black label when actionable, a flat inert well when not,
// and the brand fill retained (with a spinner) while submitting so
// the screen never looks like it died mid-request.
// ============================================================

import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface PrimaryButtonProps {
  label: string;
  /** Replaces the label while `loading` is true. */
  loadingLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

function PrimaryButton({
  label,
  loadingLabel,
  onPress,
  disabled = false,
  loading = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: PrimaryButtonProps) {
  const t = useTokens();
  const inert = disabled && !loading;

  // Both schemes resolve to a near-black, which clears 6:1 against the
  // brand blue. `text.inverse` is white in light mode, so it cannot be
  // used unconditionally here.
  const onBrand = t.isDark ? t.color.text.inverse : t.color.text.primary;
  const labelColor = inert ? t.color.text.tertiary : onBrand;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: inert
            ? withAlpha(t.color.text.primary, 'faint')
            : pressed
              ? t.color.brand.bright
              : t.color.brand.base,
          borderColor: inert ? t.color.border.subtle : 'transparent',
          shadowColor: t.color.brand.base,
          shadowOpacity: inert ? 0 : t.isDark ? 0.5 : 0.28,
          transform: [{ scale: pressed && !inert ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator animating size="small" color={onBrand} />
        ) : icon ? (
          <Icon name={icon} size={18} color={labelColor} />
        ) : null}
        <Text style={[typeScale.subheading, styles.label, { color: labelColor }]}>
          {loading ? (loadingLabel ?? label) : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    borderRadius: radii.md,
    borderWidth: 1,
    // Height grows with Dynamic Type — minHeight keeps the 44pt touch target.
    minHeight: 52,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: {
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default memo(PrimaryButton);

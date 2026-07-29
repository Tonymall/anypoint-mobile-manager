// ============================================================
// Login — Secondary action
// ============================================================
// The alternate auth path (SSO). Deliberately quieter than
// PrimaryButton: hairline border, no fill, secondary label — so
// the two never compete for "what do I tap".
// ============================================================

import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface GhostButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

function GhostButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: GhostButtonProps) {
  const t = useTokens();

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
          backgroundColor: pressed
            ? withAlpha(t.color.text.primary, 'faint')
            : 'transparent',
          borderColor: t.color.border.default,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator animating size="small" color={t.color.text.secondary} />
        ) : icon ? (
          <Icon name={icon} size={18} color={t.color.text.accent} />
        ) : null}
        <Text style={[typeScale.body, styles.label, { color: t.color.text.primary }]}>
          {label}
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
    minHeight: 48,
    justifyContent: 'center',
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
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default memo(GhostButton);

// ============================================================
// Application Detail — lifecycle action button
// ============================================================

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import {
  radii,
  spacing,
  typeScale,
  useTokens,
  type StatusRole,
} from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface ActionButtonProps {
  icon: IconName;
  label: string;
  /** Status role for the tint; defaults to the brand accent. */
  role?: StatusRole;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  role,
  onPress,
  loading,
  disabled,
}) => {
  const t = useTokens();
  const tint = role ?? t.color.accent.brand;
  const foreground = disabled ? t.color.text.tertiary : tint.base;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={`${label}${disabled ? ', disabled' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      style={[
        styles.btn,
        {
          backgroundColor: disabled ? t.color.surface.sunken : tint.surface,
          borderColor: disabled ? t.color.border.subtle : tint.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size={16} color={tint.base} />
      ) : (
        <Icon name={icon} size={16} color={foreground} />
      )}
      <Text style={[styles.label, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    minWidth: 80,
    flex: 1,
  },
  label: typeScale.label,
});

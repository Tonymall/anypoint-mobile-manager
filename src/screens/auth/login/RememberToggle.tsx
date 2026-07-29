// ============================================================
// Login — Stay signed in
// ============================================================
// Replaces a Paper Checkbox nested inside a bordered box, which
// rendered as a large tinted square that read like a second button.
// ============================================================

import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';

export interface RememberToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

function RememberToggle({ value, onChange, disabled = false }: RememberToggleProps) {
  const t = useTokens();

  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel="Stay signed in"
      accessibilityHint="Keeps this account signed in on this device"
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: pressed
            ? withAlpha(t.color.text.primary, 'faint')
            : 'transparent',
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: value ? t.color.brand.base : 'transparent',
            borderColor: value ? t.color.brand.base : t.color.border.strong,
          },
        ]}
      >
        {value ? (
          <Icon
            name="check-bold"
            size={13}
            color={t.isDark ? t.color.text.inverse : t.color.text.primary}
          />
        ) : null}
      </View>

      <View style={styles.copy}>
        <Text style={[typeScale.body, styles.title, { color: t.color.text.primary }]}>
          Stay signed in
        </Text>
        <Text style={[typeScale.caption, { color: t.color.text.secondary }]}>
          Keep this account logged in on this device
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    minHeight: 44,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
});

export default memo(RememberToggle);

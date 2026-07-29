// ============================================================
// Login — Back affordance
// ============================================================
// Only rendered in "add another account" mode, where the screen is
// pushed from Settings and needs a way out.
// ============================================================

import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { radii, spacing, typeScale, useTokens, withAlpha } from '../../../theme';

export interface BackPillProps {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}

function BackPill({ label, onPress, accessibilityLabel }: BackPillProps) {
  const t = useTokens();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: pressed
              ? withAlpha(t.color.text.primary, 'faint')
              : t.color.surface.raised,
            borderColor: t.color.border.default,
          },
        ]}
      >
        <Icon name="arrow-left" size={16} color={t.color.text.primary} />
        <Text style={[typeScale.bodySmall, styles.label, { color: t.color.text.primary }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    paddingVertical: spacing.sm,
  },
  label: {
    fontWeight: '600',
  },
});

export default memo(BackPill);

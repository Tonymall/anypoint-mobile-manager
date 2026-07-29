// ═══════════════════════════════════════════════════════════════════
// Logs — filter chip
// ═══════════════════════════════════════════════════════════════════
// One selectable/removable chip, drawn straight from the token layer.
// Used for the level and time-range options inside the filter sheet and
// for the active-filter summary under the control bar.
// ═══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
} from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';

export interface FilterChipProps {
  label: string;
  /** Small trailing count, e.g. the number of matching entries. */
  count?: number;
  selected?: boolean;
  /** Colour role for the selected state. Defaults to the brand accent. */
  role?: StatusRole;
  /** Shows a clear affordance and changes the accessibility wording. */
  removable?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

function FilterChip({
  label,
  count,
  selected = false,
  role,
  removable = false,
  onPress,
  accessibilityLabel,
}: FilterChipProps) {
  const t = useTokens();
  const active = role ?? t.color.accent.brand;

  const text = selected ? active.base : t.color.text.secondary;

  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={removable ? 'Double tap to clear this filter' : undefined}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? active.surface
            : pressed
              ? withAlpha(t.color.text.primary, 'faint')
              : 'transparent',
          borderColor: selected ? active.border : t.color.border.default,
        },
      ]}
    >
      <Text style={[styles.label, { color: text }]}>{label}</Text>
      {count !== undefined && count > 0 ? (
        <View
          style={[
            styles.countWell,
            { backgroundColor: withAlpha(text, 'subtle') },
          ]}
        >
          <Text style={[styles.count, { color: text }]}>{count}</Text>
        </View>
      ) : null}
      {removable ? (
        <Icon name="close" size={12} color={text} style={styles.close} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: 6,
  },
  label: typeScale.caption,
  countWell: {
    borderRadius: radii.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  count: typeScale.micro,
  close: {
    marginRight: -2,
  },
});

export default memo(FilterChip);

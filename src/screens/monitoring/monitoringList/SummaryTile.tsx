// ═══════════════════════════════════════════════════════════════════
// Monitoring — compact summary tile
// ═══════════════════════════════════════════════════════════════════
// A horizontal tile: icon well, then the number and its label on one
// short stack. Two of these sit side by side and cost ~64pt of the
// first viewport, where the previous full-width stacked cards cost
// most of it to convey the same two numbers.
// ═══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { Skeleton } from '../../../components/ui';
import { radii, spacing, typeScale, useTokens, type StatusRole } from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface SummaryTileProps {
  label: string;
  value: string | number;
  icon: IconName;
  /** Status role drives the icon well and any emphasised note. */
  role: StatusRole;
  /** Trailing fragment of the label line, tinted with the role. */
  note?: string;
  loading?: boolean;
}

export const SummaryTile = memo(function SummaryTile({
  label,
  value,
  icon,
  role,
  note,
  loading,
}: SummaryTileProps) {
  const t = useTokens();

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${loading ? 'loading' : value}${note ? `, ${note}` : ''}`}
      style={[
        styles.tile,
        { backgroundColor: t.color.surface.raised, borderColor: t.color.border.subtle },
      ]}
    >
      <View style={[styles.iconWell, { backgroundColor: role.surface }]}>
        <Icon name={icon} size={16} color={role.base} />
      </View>

      <View style={styles.body}>
        {loading ? (
          <Skeleton width="60%" height={22} />
        ) : (
          <Text
            numberOfLines={1}
            style={[styles.value, { color: t.color.text.primary }]}
          >
            {value}
          </Text>
        )}
        <Text numberOfLines={2} style={[typeScale.caption, { color: t.color.text.tertiary }]}>
          {label}
          {note ? (
            <Text style={{ color: role.base }}>
              {'  ·  '}
              {note}
            </Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  value: typeScale.title,
});

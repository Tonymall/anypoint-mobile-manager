// ═══════════════════════════════════════════════════════════════════
// Dashboard — stat card
// ═══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { Skeleton } from '../../../components/ui';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
} from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: IconName;
  /** Status role drives the accent, icon well and trend pill together. */
  role: StatusRole;
  subtitle?: string;
  onPress?: () => void;
  loading?: boolean;
}

export const StatCard = memo(function StatCard({
  title,
  value,
  icon,
  role,
  subtitle,
  onPress,
  loading,
}: StatCardProps) {
  const t = useTokens();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={`${title}: ${loading ? 'loading' : value}${subtitle ? `. ${subtitle}` : ''}`}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.color.surface.raised,
          borderColor: role.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: withAlpha(role.base, 0.6) }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.iconWell, { backgroundColor: role.surface }]}>
            <Icon name={icon} size={20} color={role.base} />
          </View>
          {onPress ? (
            <Icon name="chevron-right" size={14} color={t.color.text.tertiary} />
          ) : null}
        </View>

        {loading ? (
          <Skeleton width="55%" height={30} style={styles.valueSkeleton} />
        ) : (
          <Text style={[typeScale.metric, { color: t.color.text.primary }]}>
            {value}
          </Text>
        )}

        <Text style={[typeScale.label, { color: t.color.text.secondary }]}>
          {title}
        </Text>

        {subtitle ? (
          <View style={[styles.pill, { backgroundColor: role.surface }]}>
            <View style={[styles.pillDot, { backgroundColor: role.base }]} />
            <Text style={[typeScale.caption, { color: role.base }]}>{subtitle}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accent: {
    height: 3,
  },
  body: {
    padding: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconWell: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueSkeleton: {
    marginBottom: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
});

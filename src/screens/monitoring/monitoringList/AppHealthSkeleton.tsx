// ═══════════════════════════════════════════════════════════════════
// Monitoring — loading placeholder
// ═══════════════════════════════════════════════════════════════════
// Shaped like the health card that is coming, so the list does not
// jump when the data lands and the wait reads as "loading" rather
// than "empty".
// ═══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Skeleton } from '../../../components/ui';
import { radii, spacing, useTokens } from '../../../theme';

const CardShape = memo(function CardShape() {
  const t = useTokens();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.color.surface.raised, borderColor: t.color.border.subtle },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="35%" height={11} />
        </View>
        <Skeleton width={72} height={22} radius={radii.sm} />
      </View>
      <View style={styles.chipRow}>
        <Skeleton width={86} height={20} radius={radii.sm} />
        <Skeleton width={68} height={20} radius={radii.sm} />
        <Skeleton width={74} height={20} radius={radii.sm} />
      </View>
    </View>
  );
});

export const AppHealthSkeleton = memo(function AppHealthSkeleton({
  count = 4,
}: {
  count?: number;
}) {
  return (
    <View style={styles.list} accessibilityLabel="Loading monitoring data">
      {Array.from({ length: count }, (_, i) => (
        <CardShape key={i} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
});

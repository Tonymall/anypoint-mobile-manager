// ============================================================
// Application Detail — status banner
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

import {
  monoFontFamily,
  radii,
  spacing,
  typeScale,
  useTokens,
  type StatusRole,
} from '../../../theme';

export interface StatusBannerProps {
  role: StatusRole;
  label: string;
  domain: string;
  /** Mid-transition — swaps the dot for a spinner and explains the polling. */
  busy: boolean;
  /** Running apps get a soft glow on the dot. */
  glowing: boolean;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  role,
  label,
  domain,
  busy,
  glowing,
}) => {
  const t = useTokens();

  return (
    <View
      style={[
        styles.card,
        {
          borderLeftColor: role.base,
          borderColor: t.color.border.subtle,
          backgroundColor: t.color.surface.raised,
        },
      ]}
    >
      <View style={[styles.glow, { backgroundColor: role.base }]} />
      <View style={styles.content}>
        <View style={styles.row}>
          {busy ? (
            <ActivityIndicator size={14} color={role.base} style={styles.spinner} />
          ) : (
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: role.base,
                  shadowColor: role.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: glowing ? 0.6 : 0,
                  shadowRadius: 6,
                },
              ]}
            />
          )}
          <Text style={[styles.label, { color: role.base }]}>{label}</Text>
        </View>
        <Text style={[styles.domain, { color: t.color.text.secondary }]}>{domain}</Text>
        {busy && (
          <Text style={[styles.hint, { color: t.color.text.tertiary }]}>
            Refreshing status automatically…
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderLeftWidth: 3,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  glow: {
    height: 2,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  content: {
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  spinner: {
    marginRight: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  label: { ...typeScale.subheading, fontWeight: '700' },
  domain: { ...typeScale.label, fontFamily: monoFontFamily },
  hint: { ...typeScale.bodySmall, marginTop: spacing.xs, fontStyle: 'italic' },
});

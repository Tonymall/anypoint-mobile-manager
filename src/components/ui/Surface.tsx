// ═══════════════════════════════════════════════════════════════════
// Surface primitives
// ═══════════════════════════════════════════════════════════════════
// The card/section shapes that were being hand-rolled in every screen,
// expressed once against the design tokens.
// ═══════════════════════════════════════════════════════════════════

import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { Text } from 'react-native-paper';

import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
} from '../../theme';

// ── Card ────────────────────────────────────────────────────────────

export interface CardProps {
  children: ReactNode;
  /** Draws a coloured hairline across the top — use a status role's base. */
  accent?: string;
  /** Tints the border to match the accent. */
  accentBorder?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Card = memo(function Card({
  children,
  accent,
  accentBorder = true,
  padded = false,
  style,
}: CardProps) {
  const t = useTokens();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.color.surface.raised,
          borderColor:
            accent && accentBorder
              ? withAlpha(accent, 'border')
              : t.color.border.subtle,
        },
        style,
      ]}
    >
      {accent ? (
        <View style={[styles.accent, { backgroundColor: withAlpha(accent, 0.6) }]} />
      ) : null}
      <View style={padded ? styles.cardPadding : undefined}>{children}</View>
    </View>
  );
});

// ── SectionHeader ───────────────────────────────────────────────────

export interface SectionHeaderProps {
  title: string;
  /** Small muted text on the right — a count, environment name, timestamp. */
  meta?: string;
  /** Coloured dot before the title, e.g. an overall health colour. */
  indicator?: string;
  action?: ReactNode;
}

export const SectionHeader = memo(function SectionHeader({
  title,
  meta,
  indicator,
  action,
}: SectionHeaderProps) {
  const t = useTokens();

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        {indicator ? (
          <View style={[styles.indicator, { backgroundColor: indicator }]} />
        ) : null}
        <Text style={[typeScale.heading, { color: t.color.text.primary }]}>
          {title}
        </Text>
      </View>
      {action ??
        (meta ? (
          <Text style={[typeScale.caption, { color: t.color.text.tertiary }]}>
            {meta}
          </Text>
        ) : null)}
    </View>
  );
});

// ── StatusPill ──────────────────────────────────────────────────────

export interface StatusPillProps {
  label: string;
  role: StatusRole;
  /** Shows a filled dot before the label. */
  dot?: boolean;
}

export const StatusPill = memo(function StatusPill({
  label,
  role,
  dot = true,
}: StatusPillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: role.surface }]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: role.base }]} /> : null}
      <Text style={[typeScale.caption, { color: role.base }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardPadding: {
    padding: spacing.lg,
  },
  accent: {
    height: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
});

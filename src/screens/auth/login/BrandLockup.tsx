// ============================================================
// Login — Brand lockup
// ============================================================
// The mark, the wordmark and one line of positioning. Sized by
// variant so the tablet-landscape column and the phone-portrait
// stack can share one component without pinning heights (which
// would clip at large Dynamic Type sizes).
// ============================================================

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { spacing, typeScale, useTokens, withAlpha } from '../../../theme';

export type BrandLockupVariant = 'compact' | 'regular' | 'large';

/** Mark geometry per variant. Icon glyphs are not text, so fixed sizes are safe. */
const MARK: Record<BrandLockupVariant, { box: number; glyph: number }> = {
  compact: { box: 56, glyph: 28 },
  regular: { box: 72, glyph: 36 },
  large: { box: 88, glyph: 44 },
};

export interface BrandLockupProps {
  variant?: BrandLockupVariant;
  /** Left-aligns the lockup — used by the tablet-landscape two-column layout. */
  align?: 'center' | 'left';
}

function BrandLockup({ variant = 'regular', align = 'center' }: BrandLockupProps) {
  const t = useTokens();
  const mark = MARK[variant];
  const alignItems = align === 'center' ? 'center' : 'flex-start';
  const textAlign = align === 'center' ? 'center' : 'left';

  return (
    <View
      style={[styles.root, { alignItems }]}
      accessible
      accessibilityRole="header"
      accessibilityLabel="MuleOps — mobile operations control for Anypoint Platform"
    >
      <View
        style={[
          styles.mark,
          {
            width: mark.box,
            height: mark.box,
            borderRadius: mark.box * 0.3,
            backgroundColor: t.color.brand.surface,
            borderColor: withAlpha(t.color.brand.base, 'border'),
            shadowColor: t.color.brand.base,
            shadowOpacity: t.isDark ? 0.45 : 0.22,
          },
        ]}
      >
        <Icon name="api" size={mark.glyph} color={t.color.brand.bright} />
      </View>

      <Text
        style={[
          variant === 'compact' ? typeScale.title : typeScale.metric,
          styles.wordmark,
          { color: t.color.text.primary, textAlign },
        ]}
      >
        MuleOps
      </Text>

      <Text
        style={[typeScale.bodySmall, styles.tagline, { color: t.color.text.secondary, textAlign }]}
      >
        Mobile operations control for Anypoint Platform
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xs,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: spacing.md,
    // Soft brand halo — colour and opacity come from the tokens above.
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
  },
  wordmark: {
    width: '100%',
  },
  tagline: {
    width: '100%',
    maxWidth: 320,
  },
});

export default memo(BrandLockup);

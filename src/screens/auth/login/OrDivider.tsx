// ============================================================
// Login — Labelled rule
// ============================================================

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { spacing, typeScale, useTokens } from '../../../theme';

export interface OrDividerProps {
  label: string;
}

function OrDivider({ label }: OrDividerProps) {
  const t = useTokens();

  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.rule, { backgroundColor: t.color.border.subtle }]} />
      <Text style={[typeScale.caption, { color: t.color.text.secondary }]}>{label}</Text>
      <View style={[styles.rule, { backgroundColor: t.color.border.subtle }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
});

export default memo(OrDivider);

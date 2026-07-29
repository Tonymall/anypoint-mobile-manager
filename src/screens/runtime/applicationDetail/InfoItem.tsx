// ============================================================
// Application Detail — key/value row
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { spacing, typeScale, useTokens, withAlpha } from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface InfoItemProps {
  label: string;
  value: string;
  icon?: IconName;
  /** A status/accent role base colour for the icon well. */
  iconColor?: string;
}

export const InfoItem: React.FC<InfoItemProps> = ({ label, value, icon, iconColor }) => {
  const t = useTokens();
  const tint = iconColor ?? t.color.text.tertiary;

  return (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.iconBox, { backgroundColor: withAlpha(tint, 'subtle') }]}>
          <Icon name={icon} size={14} color={tint} />
        </View>
      )}
      <Text
        style={[
          styles.label,
          { color: t.color.text.secondary, width: icon ? 100 : 110 },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[styles.value, { color: t.color.text.primary }]}
        selectable
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: spacing.sm,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...typeScale.label,
    flexShrink: 0,
  },
  value: {
    ...typeScale.body,
    flex: 1,
  },
});

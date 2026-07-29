// ============================================================
// Application Detail — compact metric display
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { spacing, typeScale, useTokens, type StatusRole } from '../../../theme';
import type { IconName } from '../../../types/icons';

export interface MetricBoxProps {
  label: string;
  value: string;
  /** Categorical role driving the icon well. */
  role: StatusRole;
  icon: IconName;
  /** Renders the value in the danger colour — a threshold breach. */
  warning?: boolean;
}

export const MetricBox: React.FC<MetricBoxProps> = ({
  label,
  value,
  role,
  icon,
  warning,
}) => {
  const t = useTokens();

  return (
    <View style={styles.box}>
      <View style={[styles.iconCircle, { backgroundColor: role.surface }]}>
        <Icon name={icon} size={18} color={role.base} />
      </View>
      <Text
        style={[
          styles.value,
          { color: warning ? t.color.status.danger.base : t.color.text.primary },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.label, { color: t.color.text.secondary }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  value: { ...typeScale.title, fontSize: 24, lineHeight: 30 },
  label: { ...typeScale.micro, fontWeight: '500' },
});

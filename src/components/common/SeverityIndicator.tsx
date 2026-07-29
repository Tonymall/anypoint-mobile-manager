// ============================================================
// SeverityIndicator — icon + label for an alert severity
// ============================================================
// Built on the design token layer: severity resolves to a semantic
// status role, the same one the alert lists use.
// ============================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { spacing, typeScale, useTokens } from '../../theme';
import { getSeverityRole } from '../../utils/statusHelpers';
import type { AlertSeverity } from '../../types';
import type { IconName } from '../../types/icons';

interface SeverityIndicatorProps {
  severity: AlertSeverity;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const severityIconMap: Record<AlertSeverity, IconName> = {
  CRITICAL: 'alert-circle',
  WARNING: 'alert',
  INFO: 'information',
};

const severityLabelMap: Record<AlertSeverity, string> = {
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  INFO: 'Info',
};

const sizeMap = {
  small: { icon: 14, label: typeScale.micro },
  medium: { icon: 18, label: typeScale.label },
  large: { icon: 22, label: typeScale.body },
} as const;

const SeverityIndicator: React.FC<SeverityIndicatorProps> = ({
  severity,
  showLabel = true,
  size = 'medium',
}) => {
  const t = useTokens();
  const role = getSeverityRole(t, severity);
  const iconName = severityIconMap[severity] ?? 'information';
  const label = severityLabelMap[severity] ?? severity;
  const dimensions = sizeMap[size];

  return (
    <View style={styles.container}>
      <Icon name={iconName} size={dimensions.icon} color={role.base} />
      {showLabel && (
        <Text style={[styles.label, dimensions.label, { color: role.base }]}>
          {label}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
});

export default SeverityIndicator;

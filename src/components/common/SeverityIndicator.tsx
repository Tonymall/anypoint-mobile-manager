import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { severityColors } from '../../theme';
import type { AlertSeverity } from '../../types';

interface SeverityIndicatorProps {
  severity: AlertSeverity;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const severityIconMap: Record<AlertSeverity, string> = {
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
  small: { icon: 14, font: 10 as const },
  medium: { icon: 18, font: 12 as const },
  large: { icon: 22, font: 14 as const },
};

const SeverityIndicator: React.FC<SeverityIndicatorProps> = ({
  severity,
  showLabel = true,
  size = 'medium',
}) => {
  const theme = useTheme();
  const color = severityColors[severity] ?? theme.colors.outline;
  const iconName = severityIconMap[severity] ?? 'information';
  const label = severityLabelMap[severity] ?? severity;
  const dimensions = sizeMap[size];

  return (
    <View style={styles.container}>
      <Icon name={iconName} size={dimensions.icon} color={color} />
      {showLabel && (
        <Text
          style={[
            styles.label,
            {
              color,
              fontSize: dimensions.font,
            },
          ]}
        >
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
    marginLeft: 4,
    fontWeight: '600',
  },
});

export default SeverityIndicator;

// ============================================================
// App Monitoring Detail - Metric Card
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Text, type MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: string;
  theme: MD3Theme;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, icon, color, theme }) => (
  <View
    accessibilityLabel={`${title}: ${value}${subtitle ? ', ' + subtitle : ''}`}
    style={{
      flex: 1,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: color + '15',
      overflow: 'hidden',
    }}
  >
    <View style={{ height: 2.5, backgroundColor: color, opacity: 0.5 }} />
    <View style={{ padding: 14 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: color + '12',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Icon name={icon} size={17} color={color} />
      </View>
      <Text
        style={{ fontWeight: '800', fontSize: 24, color: theme.colors.onSurface, marginBottom: 2, letterSpacing: -0.5 }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500', letterSpacing: 0.2 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 10, marginTop: 3, opacity: 0.8 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  </View>
);

export default MetricCard;

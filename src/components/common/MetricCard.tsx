import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: string;
  trend?: {
    direction: 'up' | 'down';
    percentage: number;
  };
  onPress?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  icon,
  trend,
  onPress,
}) => {
  const theme = useTheme();

  const trendColor =
    trend?.direction === 'up'
      ? theme.colors.error
      : theme.colors.tertiary;

  const trendIcon =
    trend?.direction === 'up' ? 'arrow-up' : 'arrow-down';

  return (
    <Card
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      onPress={onPress}
      mode="elevated"
    >
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          {icon && (
            <Icon
              name={icon}
              size={20}
              color={theme.colors.primary}
              style={styles.icon}
            />
          )}
          <Text
            variant="labelMedium"
            style={[styles.title, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        <View style={styles.valueRow}>
          <Text
            variant="headlineMedium"
            style={[styles.value, { color: theme.colors.onSurface }]}
            numberOfLines={1}
          >
            {value}
          </Text>
          {unit && (
            <Text
              variant="bodySmall"
              style={[styles.unit, { color: theme.colors.onSurfaceVariant }]}
            >
              {unit}
            </Text>
          )}
        </View>
        {trend && (
          <View style={styles.trendRow}>
            <Icon name={trendIcon} size={14} color={trendColor} />
            <Text
              variant="labelSmall"
              style={[styles.trendText, { color: trendColor }]}
            >
              {trend.percentage.toFixed(1)}%
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
  },
  content: {
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    marginRight: 6,
  },
  title: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontWeight: '700',
  },
  unit: {
    marginLeft: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  trendText: {
    marginLeft: 2,
    fontWeight: '600',
  },
});

export default MetricCard;

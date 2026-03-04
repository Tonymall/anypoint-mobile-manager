import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import {
  CartesianChart,
  Bar,
  useChartPressState,
} from 'victory-native';

interface DataPoint {
  x: number;
  y: number;
}

interface SimpleBarChartProps {
  data: DataPoint[];
  title?: string;
  color?: string;
  height?: number;
  barWidth?: number;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
  data,
  title,
  color,
  height = 200,
  barWidth = 16,
}) => {
  const theme = useTheme();
  const barColor = color ?? theme.colors.primary;
  const { state, isActive } = useChartPressState({ x: 0, y: { y: 0 } });

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        {title && (
          <Text
            variant="titleSmall"
            style={[styles.title, { color: theme.colors.onSurface }]}
          >
            {title}
          </Text>
        )}
        <View style={styles.emptyContainer}>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            No data available
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {title && (
        <Text
          variant="titleSmall"
          style={[styles.title, { color: theme.colors.onSurface }]}
        >
          {title}
        </Text>
      )}
      {isActive && (
        <View style={styles.tooltipRow}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            x: {state.x.value.value.toFixed(1)}
          </Text>
          <Text variant="labelSmall" style={[styles.tooltipValue, { color: barColor }]}>
            y: {state.y.y.value.value.toFixed(2)}
          </Text>
        </View>
      )}
      <View style={{ height }}>
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['y']}
          chartPressState={state}
          axisOptions={{
            font: null,
            tickCount: { x: data.length, y: 4 },
            labelColor: theme.colors.onSurfaceVariant,
            lineColor: theme.colors.outlineVariant,
          }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.y}
              chartBounds={chartBounds}
              color={barColor}
              barWidth={barWidth}
              roundedCorners={{ topLeft: 4, topRight: 4 }}
              animate={{ type: 'timing', duration: 500 }}
            />
          )}
        </CartesianChart>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 4,
  },
  tooltipValue: {
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SimpleBarChart;

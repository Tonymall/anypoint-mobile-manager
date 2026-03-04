import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import {
  CartesianChart,
  Line,
  useChartPressState,
} from 'victory-native';

interface DataPoint {
  x: number;
  y: number;
  [key: string]: unknown;
}

interface SimpleLineChartProps {
  data: DataPoint[];
  title?: string;
  yLabel?: string;
  color?: string;
  height?: number;
  curved?: boolean;
}

const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
  data,
  title,
  yLabel,
  color,
  height = 200,
  curved = true,
}) => {
  const theme = useTheme();
  const lineColor = color ?? theme.colors.primary;
  const { state, isActive } = useChartPressState({
    x: 0 as never,
    y: { y: 0 } as never,
  });

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
        <View style={styles.headerRow}>
          <Text
            variant="titleSmall"
            style={[styles.title, { color: theme.colors.onSurface }]}
          >
            {title}
          </Text>
          {yLabel && (
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {yLabel}
            </Text>
          )}
        </View>
      )}
      {isActive && (
        <View style={styles.tooltipRow}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            x: {(state.x.value.value as number).toFixed(1)}
          </Text>
          <Text variant="labelSmall" style={[styles.tooltipValue, { color: lineColor }]}>
            y: {((state.y as any).y.value.value as number).toFixed(2)}
          </Text>
        </View>
      )}
      <View style={{ height }}>
        <CartesianChart
          data={data}
          xKey={"x" as never}
          yKeys={["y" as never]}
          chartPressState={state as any}
          axisOptions={{
            font: null,
            tickCount: { x: 5, y: 4 },
            labelColor: theme.colors.onSurfaceVariant,
            lineColor: theme.colors.outlineVariant,
          }}
        >
          {({ points }: any) => (
            <Line
              points={points.y}
              color={lineColor}
              strokeWidth={2}
              curveType={curved ? 'natural' : 'linear'}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  title: {
    fontWeight: '600',
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

export default SimpleLineChart;

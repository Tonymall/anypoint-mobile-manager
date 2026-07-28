// ============================================================
// App Monitoring Detail - Simple Line Chart
// Pure React Native visualization (no chart library).
// ============================================================

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text, type MD3Theme } from 'react-native-paper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SimpleLineChartProps {
  data: number[];
  maxValue?: number;
  color: string;
  height?: number;
  theme: MD3Theme;
  label: string;
  unit?: string;
  fillOpacity?: number;
}

const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
  data, maxValue, color, height = 80, theme, label, unit = '%', fillOpacity = 0.1
}) => {
  const chartWidth = SCREEN_WIDTH - 80;
  const max = maxValue ?? Math.max(...data, 1);
  const latestValue = data.length > 0 ? data[data.length - 1] : 0;
  const minValue = data.length > 0 ? Math.min(...data) : 0;
  const avgValue = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;

  const points = data.map((value, idx) => ({
    x: (idx / Math.max(data.length - 1, 1)) * chartWidth,
    y: height - Math.max(1, (value / max) * height),
  }));

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {unit === ' MB' ? Math.round(latestValue).toLocaleString() : Math.round(latestValue)}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{unit}</Text>
        </View>
      </View>
      {data.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
          <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>
            Min: {Math.round(minValue)}{unit}
          </Text>
          <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>
            Avg: {Math.round(avgValue)}{unit}
          </Text>
          <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>
            Max: {Math.round(Math.max(...data))}{unit}
          </Text>
        </View>
      )}
      <View
        style={{
          height,
          backgroundColor: theme.colors.surfaceVariant + '40',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {[0.25, 0.5, 0.75].map((pct) => (
          <View
            key={pct}
            style={{
              position: 'absolute',
              top: height * pct,
              left: 0,
              right: 0,
              height: StyleSheet.hairlineWidth,
              backgroundColor: theme.colors.outlineVariant,
              opacity: 0.5,
            }}
          />
        ))}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          {points.map((point, idx) => {
            if (idx >= points.length - 1) return null;
            const nextPoint = points[idx + 1];
            const segWidth = nextPoint.x - point.x;
            const maxY = Math.max(height - point.y, height - nextPoint.y);
            return (
              <View
                key={`fill-${idx}`}
                style={{
                  position: 'absolute',
                  left: point.x,
                  bottom: 0,
                  width: segWidth + 1,
                  height: maxY,
                  backgroundColor: color,
                  opacity: fillOpacity,
                }}
              />
            );
          })}
        </View>
        {points.map((point, idx) => (
          <React.Fragment key={idx}>
            {idx < points.length - 1 && (() => {
              const nextPoint = points[idx + 1];
              const dx = nextPoint.x - point.x;
              const dy = nextPoint.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View
                  style={{
                    position: 'absolute',
                    left: point.x,
                    top: point.y,
                    width: length,
                    height: 2,
                    backgroundColor: color,
                    transformOrigin: 'left center',
                    transform: [{ rotate: `${angle}deg` }],
                  }}
                />
              );
            })()}
            {(idx === points.length - 1 || data.length <= 10) && (
              <View
                style={{
                  position: 'absolute',
                  left: point.x - 3,
                  top: point.y - 3,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: color,
                  borderWidth: 1.5,
                  borderColor: theme.colors.surface,
                }}
              />
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};

export default SimpleLineChart;

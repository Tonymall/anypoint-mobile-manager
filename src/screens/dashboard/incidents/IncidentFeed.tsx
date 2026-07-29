// ============================================================
// Dashboard — Incident Feed
// ============================================================
// "What needs me right now", above everything else on the home
// screen. Shows nothing but a calm all-clear when the estate is
// healthy, so the section earns its place at the top.
// ============================================================

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme, type MD3Theme } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { anypointColors } from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';
import type {
  Incident,
  IncidentSeverity,
  IncidentSource,
} from '../../../services/incidentFeed';
import type { IconName } from '../../../types/icons';

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  critical: anypointColors.error,
  warning: anypointColors.warning,
  info: anypointColors.info,
};

const SOURCE_ICON: Record<IncidentSource, IconName> = {
  runtime: 'application-cog',
  alert: 'bell-ring',
  insights: 'chart-line-variant',
};

const SOURCE_LABEL: Record<IncidentSource, string> = {
  runtime: 'Runtime',
  alert: 'Alert',
  insights: 'Insights',
};

/** How many rows we show before collapsing behind a "view all". */
const VISIBLE_LIMIT = 5;

function relativeTime(timestamp?: number): string | null {
  if (!timestamp) return null;
  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 0) return null;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const IncidentRow = memo(function IncidentRow({
  incident,
  isLast,
  onPress,
  theme,
}: {
  incident: Incident;
  isLast: boolean;
  onPress: () => void;
  theme: MD3Theme;
}) {
  const color = SEVERITY_COLOR[incident.severity];
  const age = relativeTime(incident.timestamp);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${incident.severity} ${SOURCE_LABEL[incident.source]}: ${incident.title}. ${incident.detail}`}
      accessibilityHint="Double tap to open"
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: theme.colors.outlineVariant,
          backgroundColor: pressed ? theme.colors.surfaceVariant + '40' : 'transparent',
        },
      ]}
    >
      <View style={[styles.severityBar, { backgroundColor: color }]} />
      <View style={[styles.rowIcon, { backgroundColor: color + '15' }]}>
        <Icon name={SOURCE_ICON[incident.source]} size={18} color={color} />
      </View>
      <View style={styles.rowBody}>
        <Text
          numberOfLines={1}
          style={[styles.rowTitle, { color: theme.colors.onSurface }]}
        >
          {incident.title}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.rowDetail, { color: theme.colors.onSurfaceVariant }]}
        >
          {incident.detail}
        </Text>
      </View>
      <View style={styles.rowMeta}>
        {age && (
          <Text style={[styles.rowAge, { color: theme.colors.onSurfaceVariant }]}>
            {age}
          </Text>
        )}
        <Icon
          name="chevron-right"
          size={14}
          color={theme.colors.onSurfaceVariant}
          style={{ opacity: 0.4 }}
        />
      </View>
    </Pressable>
  );
});

const AllClear = memo(function AllClear({ theme }: { theme: MD3Theme }) {
  return (
    <View style={styles.allClear}>
      <View style={[styles.allClearIcon, { backgroundColor: anypointColors.success + '15' }]}>
        <Icon name="check-circle-outline" size={22} color={anypointColors.success} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.allClearTitle, { color: theme.colors.onSurface }]}>
          All clear
        </Text>
        <Text style={[styles.allClearBody, { color: theme.colors.onSurfaceVariant }]}>
          No failing apps, open alerts or elevated error rates.
        </Text>
      </View>
    </View>
  );
});

export interface IncidentFeedProps {
  incidents: Incident[];
  summary: { critical: number; warning: number; info: number; total: number };
  isLoading: boolean;
  onSelect: (incident: Incident) => void;
  onViewAll?: () => void;
}

function IncidentFeed({
  incidents,
  summary,
  isLoading,
  onSelect,
  onViewAll,
}: IncidentFeedProps) {
  const theme = useTheme();
  const visible = useMemo(() => incidents.slice(0, VISIBLE_LIMIT), [incidents]);
  const hidden = incidents.length - visible.length;

  const headlineColor =
    summary.critical > 0
      ? anypointColors.error
      : summary.warning > 0
        ? anypointColors.warning
        : anypointColors.success;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerDot, { backgroundColor: headlineColor }]} />
          <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            Needs attention
          </Text>
        </View>
        {summary.total > 0 && (
          <View style={[styles.headerBadge, { backgroundColor: headlineColor + '15' }]}>
            <Text style={[styles.headerBadgeText, { color: headlineColor }]}>
              {summary.critical > 0 ? `${summary.critical} critical` : `${summary.total}`}
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: headlineColor + '18',
          },
        ]}
      >
        <View style={{ height: 3, backgroundColor: headlineColor, opacity: 0.6 }} />
        {isLoading && incidents.length === 0 ? (
          <View style={styles.loading}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
              Checking your estate…
            </Text>
          </View>
        ) : incidents.length === 0 ? (
          <AllClear theme={theme} />
        ) : (
          <>
            {visible.map((incident, index) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                isLast={index === visible.length - 1 && hidden === 0}
                theme={theme}
                onPress={() => {
                  hapticSelection();
                  onSelect(incident);
                }}
              />
            ))}
            {hidden > 0 && (
              <Pressable
                onPress={() => {
                  hapticSelection();
                  onViewAll?.();
                }}
                accessibilityRole="button"
                accessibilityLabel={`View all ${incidents.length} items needing attention`}
                style={({ pressed }) => [
                  styles.viewAll,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.viewAllText, { color: theme.colors.primary }]}>
                  {`${hidden} more`}
                </Text>
                <Icon name="chevron-right" size={14} color={theme.colors.primary} />
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  loading: {
    padding: 20,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 16,
    paddingLeft: 12,
  },
  severityBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  rowDetail: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  rowAge: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 4,
  },
  allClear: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  allClearIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  allClearTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  allClearBody: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    marginRight: 2,
  },
});

export default memo(IncidentFeed);

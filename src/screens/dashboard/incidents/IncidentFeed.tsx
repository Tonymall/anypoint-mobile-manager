// ============================================================
// Dashboard — Incident Feed
// ============================================================
// "What needs me right now", above everything else on the home
// screen. Shows nothing but a calm all-clear when the estate is
// healthy, so the section earns its place at the top.
// ============================================================

import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { typeScale, useTokens, withAlpha, type Tokens } from '../../../theme';
import { hapticSelection } from '../../../utils/haptics';
import type {
  Incident,
  IncidentSeverity,
  IncidentSource,
} from '../../../services/incidentFeed';
import type { IconName } from '../../../types/icons';

/** Severity maps onto the status roles rather than naming colours. */
function severityRole(t: Tokens, severity: IncidentSeverity) {
  if (severity === 'critical') return t.color.status.danger;
  if (severity === 'warning') return t.color.status.warning;
  return t.color.status.info;
}

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
  t,
}: {
  incident: Incident;
  isLast: boolean;
  onPress: () => void;
  t: Tokens;
}) {
  const role = severityRole(t, incident.severity);
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
          borderBottomColor: t.color.border.subtle,
          backgroundColor: pressed
            ? withAlpha(t.color.text.primary, 'faint')
            : 'transparent',
        },
      ]}
    >
      <View style={[styles.severityBar, { backgroundColor: role.base }]} />
      <View style={[styles.rowIcon, { backgroundColor: role.surface }]}>
        <Icon name={SOURCE_ICON[incident.source]} size={18} color={role.base} />
      </View>
      <View style={styles.rowBody}>
        <Text
          numberOfLines={1}
          style={[styles.rowTitle, { color: t.color.text.primary }]}
        >
          {incident.title}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.rowDetail, { color: t.color.text.secondary }]}
        >
          {incident.detail}
        </Text>
      </View>
      <View style={styles.rowMeta}>
        {age && (
          <Text style={[styles.rowAge, { color: t.color.text.tertiary }]}>
            {age}
          </Text>
        )}
        <Icon
          name="chevron-right"
          size={14}
          color={t.color.text.tertiary}
        />
      </View>
    </Pressable>
  );
});

const AllClear = memo(function AllClear({ t }: { t: Tokens }) {
  return (
    <View style={styles.allClear}>
      <View style={[styles.allClearIcon, { backgroundColor: t.color.status.success.surface }]}>
        <Icon name="check-circle-outline" size={22} color={t.color.status.success.base} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.allClearTitle, { color: t.color.text.primary }]}>
          All clear
        </Text>
        <Text style={[styles.allClearBody, { color: t.color.text.secondary }]}>
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
  const t = useTokens();
  const visible = useMemo(() => incidents.slice(0, VISIBLE_LIMIT), [incidents]);
  const hidden = incidents.length - visible.length;

  const headline =
    summary.critical > 0
      ? t.color.status.danger
      : summary.warning > 0
        ? t.color.status.warning
        : t.color.status.success;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerDot, { backgroundColor: headline.base }]} />
          <Text style={[styles.headerTitle, { color: t.color.text.primary }]}>
            Needs attention
          </Text>
        </View>
        {summary.total > 0 && (
          <View style={[styles.headerBadge, { backgroundColor: headline.surface }]}>
            <Text style={[styles.headerBadgeText, { color: headline.base }]}>
              {summary.critical > 0 ? `${summary.critical} critical` : `${summary.total}`}
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: t.color.surface.raised,
            borderColor: headline.border,
          },
        ]}
      >
        <View style={{ height: 3, backgroundColor: withAlpha(headline.base, 0.6) }} />
        {isLoading && incidents.length === 0 ? (
          <View style={styles.loading}>
            <Text style={{ color: t.color.text.secondary, ...t.type.bodySmall }}>
              Checking your estate…
            </Text>
          </View>
        ) : incidents.length === 0 ? (
          <AllClear t={t} />
        ) : (
          <>
            {visible.map((incident, index) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                isLast={index === visible.length - 1 && hidden === 0}
                t={t}
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
                <Text style={[styles.viewAllText, { color: t.color.text.accent }]}>
                  {`${hidden} more`}
                </Text>
                <Icon name="chevron-right" size={14} color={t.color.text.accent} />
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
  headerTitle: typeScale.heading,
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerBadgeText: typeScale.caption,
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
  rowTitle: { ...typeScale.body, fontWeight: '700', marginBottom: 2 },
  rowDetail: typeScale.label,
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  rowAge: { ...typeScale.caption, marginRight: 4 },
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
  allClearTitle: { ...typeScale.subheading, fontWeight: '700', marginBottom: 2 },
  allClearBody: typeScale.label,
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  viewAllText: { ...typeScale.bodySmall, fontWeight: '700', marginRight: 2 },
});

export default memo(IncidentFeed);

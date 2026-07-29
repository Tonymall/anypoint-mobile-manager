import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useRouter, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { useAuditLogs } from '../../hooks/queries';
import type { AuditLogEntry } from '../../types';
import { anypointColors } from '../../theme';

type PlatformFilter = 'all' | 'mq' | 'object-store';

function formatRelativeTime(raw?: string): string {
  if (!raw) return 'Unknown time';
  const timestamp = new Date(raw).getTime();
  if (Number.isNaN(timestamp)) return raw;

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.round(diffHours / 24)}d ago`;
}

function stringifyPayload(payload?: Record<string, unknown>): string {
  if (!payload) return '';
  try {
    return JSON.stringify(payload).toLowerCase();
  } catch {
    return '';
  }
}

function matchesPlatform(entry: AuditLogEntry, filter: PlatformFilter): boolean {
  if (filter === 'all') return true;

  const haystack = [
    entry.platform,
    entry.objectType,
    entry.objectId,
    entry.action,
    stringifyPayload(entry.payload),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (filter === 'mq') {
    return /anypoint mq|mq\b|queue|exchange|message/.test(haystack);
  }

  return /object store|objectstore|osv2|key-value|keyvalue|bucket|object/.test(haystack);
}

function detectKind(entry: AuditLogEntry): 'mq' | 'object-store' | 'other' {
  if (matchesPlatform(entry, 'mq')) return 'mq';
  if (matchesPlatform(entry, 'object-store')) return 'object-store';
  return 'other';
}

const PlatformActivityScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isFocused = useIsFocused();
  const [filter, setFilter] = useState<PlatformFilter>('all');

  const { data: auditLogs, isLoading } = useAuditLogs({
    limit: 80,
  }, { enabled: isFocused });

  const allEntries = auditLogs?.data ?? [];
  const entries = useMemo(
    () => allEntries.filter((entry) => matchesPlatform(entry, filter)),
    [allEntries, filter],
  );

  const mqCount = allEntries.filter((entry) => matchesPlatform(entry, 'mq')).length;
  const objectStoreCount = allEntries.filter((entry) => matchesPlatform(entry, 'object-store')).length;
  const uniqueUsers = new Set(entries.map((entry) => entry.userId || entry.userName).filter(Boolean)).size;

  const topActions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const key = entry.action || 'Unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]).slice(0, 6);
  }, [entries]);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Platform Activity" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              MQ and Object Store activity
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Audit-backed activity feed. The page now matches against platform, object type, object id, and payload fields so tenant-specific audit shapes do not disappear just because the server-side platform label changes.
            </Text>

            <View style={styles.filterRow}>
              {[
                { key: 'all', label: 'All' },
                { key: 'mq', label: 'MQ' },
                { key: 'object-store', label: 'Object Store' },
              ].map((option) => {
                const selected = option.key === filter;
                const color = option.key === 'mq'
                  ? anypointColors.secondary
                  : option.key === 'object-store'
                    ? anypointColors.warning
                    : theme.colors.primary;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setFilter(option.key as PlatformFilter)}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: selected ? color : theme.colors.outlineVariant,
                        backgroundColor: selected ? color + '12' : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? color : theme.colors.onSurface }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{entries.length}</Text>
            <Text style={styles.statLabel}>Visible events</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.secondary + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.secondary }]}>{mqCount}</Text>
            <Text style={styles.statLabel}>MQ matches</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.warning }]}>{objectStoreCount}</Text>
            <Text style={styles.statLabel}>Object Store</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.success + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.success }]}>{uniqueUsers}</Text>
            <Text style={styles.statLabel}>Actors</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Action summary
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Useful for seeing whether the feed is dominated by updates, reads, or destructive operations.
            </Text>

            <View style={styles.actionWrap}>
              {topActions.length > 0 ? topActions.map(([action, count]) => (
                <View key={action} style={[styles.actionPill, { backgroundColor: theme.colors.primary + '12' }]}>
                  <Text style={[styles.actionText, { color: theme.colors.primary }]}>
                    {action} - {count}
                  </Text>
                </View>
              )) : (
                <Text variant="bodySmall" style={styles.emptyCopy}>
                  No actions available yet for the selected filter.
                </Text>
              )}
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Recent events
            </Text>

            {isLoading ? (
              <Text variant="bodySmall" style={styles.emptyCopy}>
                Loading platform activity...
              </Text>
            ) : null}

            {!isLoading && entries.length === 0 ? (
              <Text variant="bodySmall" style={styles.emptyCopy}>
                No recent MQ or Object Store activity matched the selected filter. If your tenant uses different audit labels, this page now falls back to payload and object matching, so a truly empty state usually means the audit stream did not include those events in the current time window.
              </Text>
            ) : null}

            {entries.map((entry) => {
              const payloadKeys = Object.keys(entry.payload ?? {});
              const kind = detectKind(entry);
              const chipColor = kind === 'mq'
                ? anypointColors.secondary
                : kind === 'object-store'
                  ? anypointColors.warning
                  : theme.colors.primary;
              const chipLabel = kind === 'mq' ? 'MQ' : kind === 'object-store' ? 'Object Store' : 'Activity';

              return (
                <View key={entry.id} style={[styles.eventCard, { borderColor: theme.colors.outlineVariant }]}>
                  <View style={styles.eventHeader}>
                    <View style={[styles.iconWrap, { backgroundColor: chipColor + '12' }]}>
                      <Icon name={kind === 'mq' ? 'message-processing-outline' : 'database-outline'} size={18} color={chipColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle}>
                        {entry.action} {entry.objectType || 'resource'}
                      </Text>
                      <Text style={styles.eventMeta}>
                        {entry.objectId || 'Unknown object'}
                      </Text>
                    </View>
                    <Text style={styles.eventTime}>{formatRelativeTime(entry.timestamp)}</Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={[styles.metaPill, { color: chipColor, backgroundColor: chipColor + '12' }]}>{chipLabel}</Text>
                    <Text style={styles.metaPill}>{entry.userName || 'Unknown user'}</Text>
                    {entry.environmentName ? (
                      <Text style={styles.metaPill}>{entry.environmentName}</Text>
                    ) : null}
                    {entry.platform ? (
                      <Text style={styles.metaPill}>{entry.platform}</Text>
                    ) : null}
                  </View>

                  {payloadKeys.length > 0 ? (
                    <Text style={styles.payloadPreview}>
                      {payloadKeys.slice(0, 4).join(', ')}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  statLabel: {
    marginTop: 4,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
  actionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  eventCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 10,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: {
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '600',
  },
  eventMeta: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 2,
  },
  eventTime: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  metaPill: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '600',
  },
  payloadPreview: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 10,
  },
  emptyCopy: {
    color: theme.colors.onSurfaceVariant,
  },
});

export default PlatformActivityScreen;

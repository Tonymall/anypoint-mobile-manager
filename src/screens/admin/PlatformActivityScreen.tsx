import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuditLogs } from '../../hooks/queries';
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

const PlatformActivityScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState<PlatformFilter>('all');

  const platforms = filter === 'mq'
    ? ['Anypoint MQ']
    : filter === 'object-store'
      ? ['Object Store']
      : ['Anypoint MQ', 'Object Store'];

  const { data: auditLogs, isLoading } = useAuditLogs({
    platforms,
    limit: 25,
  });

  const entries = auditLogs?.data ?? [];

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
              Audit-backed activity feed for recent events touching Anypoint MQ and Object Store.
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
                No recent activity was returned for the selected filter.
              </Text>
            ) : null}

            {entries.map((entry) => (
              <View key={entry.id} style={[styles.eventRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '12' }]}>
                  <Icon name="database-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>
                    {entry.action} {entry.objectType || 'resource'}
                  </Text>
                  <Text style={styles.eventMeta}>
                    {entry.objectId || 'Unknown object'}
                  </Text>
                  <Text style={styles.eventMeta}>
                    {entry.userName || 'Unknown user'}
                  </Text>
                </View>
                <Text style={styles.eventTime}>{formatRelativeTime(entry.timestamp)}</Text>
              </View>
            ))}
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  emptyCopy: {
    color: theme.colors.onSurfaceVariant,
  },
});

export default PlatformActivityScreen;

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { anypointColors } from '../../theme';
import * as cloudHubNotificationService from '../../services/cloudHubNotificationService';

type NotificationFilter = 'all' | 'unread';

function formatRelative(raw?: string | null): string {
  if (!raw) return 'Unknown time';
  const timestamp = new Date(raw).getTime();
  if (Number.isNaN(timestamp)) return raw;
  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

const CloudHubNotificationsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const countQuery = useQuery({
    queryKey: ['admin-cloudhub-notifications', 'count'],
    queryFn: () => cloudHubNotificationService.getNotificationCount('unread'),
  });

  const notificationsQuery = useQuery({
    queryKey: ['admin-cloudhub-notifications', filter],
    queryFn: () => cloudHubNotificationService.getNotifications({
      status: filter === 'unread' ? 'unread' : undefined,
      limit: 40,
    }),
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = countQuery.data ?? 0;
  const criticalCount = notifications.filter((entry) => /critical|error/i.test(entry.severity ?? '')).length;
  const affectedTargets = new Set(notifications.map((entry) => entry.targetName).filter(Boolean)).size;

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="CloudHub Notifications" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>Platform inbox</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Native CloudHub notification feed, including unread count and recent event targets from the control plane.
            </Text>
            <View style={styles.filterRow}>
              {(['all', 'unread'] as NotificationFilter[]).map((option) => {
                const selected = option === filter;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setFilter(option)}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
                        backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? theme.colors.primary : theme.colors.onSurface }}>
                      {option === 'all' ? 'All' : 'Unread'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{unreadCount}</Text>
            <Text style={styles.statLabel}>Unread</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.warning }]}>{notifications.length}</Text>
            <Text style={styles.statLabel}>Visible</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.error + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.error }]}>{criticalCount}</Text>
            <Text style={styles.statLabel}>Critical</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.secondary + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.secondary }]}>{affectedTargets}</Text>
            <Text style={styles.statLabel}>Targets</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Recent notifications</Text>
            {notifications.length > 0 ? notifications.map((entry) => (
              <View key={entry.id} style={[styles.eventCard, { borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.eventHeader}>
                  <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '12' }]}>
                    <Icon name="bell-ring-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{entry.title}</Text>
                    <Text style={styles.rowMeta}>
                      {entry.targetName ?? 'Platform resource'}{entry.severity ? ` • ${entry.severity}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>{formatRelative(entry.createdAt)}</Text>
                </View>
                {entry.body ? <Text style={styles.bodyCopy}>{entry.body}</Text> : null}
                {entry.status ? <Text style={styles.statusText}>{entry.status}</Text> : null}
              </View>
            )) : <Text style={styles.emptyCopy}>No CloudHub notifications were returned for this filter.</Text>}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 20 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { color: theme.colors.onSurfaceVariant, marginBottom: 10, lineHeight: 18 },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 10 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  statLabel: { marginTop: 4, color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  eventCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { marginTop: 2, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  timeText: { color: theme.colors.onSurfaceVariant, fontSize: 11 },
  bodyCopy: { marginTop: 10, color: theme.colors.onSurfaceVariant, lineHeight: 18, fontSize: 12 },
  statusText: { marginTop: 8, color: theme.colors.primary, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  emptyCopy: { color: theme.colors.onSurfaceVariant, fontSize: 12 },
});

export default CloudHubNotificationsScreen;

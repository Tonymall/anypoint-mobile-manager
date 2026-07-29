// ============================================================
// Notifications — the Feed segment of the Alerts tab
// ============================================================
// Lifecycle events and triggered alerts for the active account,
// newest first.
//
// Built on the design token layer: each notification action maps to a
// semantic status role, so the icon well, its tint and the unread
// border stay in step across both colour schemes.
// ============================================================

import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { useNotificationStore } from '../../stores/notificationStore';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import {
  clearAlertHistory,
  deleteAlertHistoryItem,
  fetchAlertHistory,
  mapBackendAlertToNotification,
} from '../../services/backendService';
import logger from '../../utils/logger';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
  type Tokens,
} from '../../theme';
import EmptyState from '../../components/common/EmptyState';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import type { AppNotification, NotificationAction } from '../../types';
import type { IconName } from '../../types/icons';

const ACTION_ICONS: Record<NotificationAction, IconName> = {
  start: 'play-circle-outline',
  stop: 'stop-circle-outline',
  restart: 'restart',
  status_change: 'swap-vertical',
  deploy: 'rocket-launch-outline',
  undeploy: 'rocket-launch-outline',
  error: 'alert-circle-outline',
  alert: 'alert-circle-outline',
  info: 'information-outline',
};

/** Notification action → semantic status role. */
const getActionRole = (t: Tokens, action: NotificationAction): StatusRole => {
  switch (action) {
    case 'start':
      return t.color.status.success;
    case 'stop':
    case 'undeploy':
      return t.color.status.warning;
    case 'restart':
    case 'status_change':
      return t.color.status.info;
    case 'deploy':
      return t.color.accent.tertiary;
    case 'error':
    case 'alert':
      return t.color.status.danger;
    case 'info':
    default:
      return t.color.accent.brand;
  }
};

const NotificationCard: React.FC<{
  item: AppNotification;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  t: Tokens;
}> = React.memo(({ item, onPress, onDelete, t }) => {
  const iconName = ACTION_ICONS[item.action] ?? 'information-outline';
  const role = getActionRole(t, item.action);

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress(item.id);
      }}
      android_ripple={{ color: t.color.brand.surface }}
      accessibilityLabel={`${item.read ? '' : 'Unread '}notification: ${item.title}. ${item.body}. ${formatRelativeTime(item.timestamp)}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to mark as read"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: item.read
            ? t.color.surface.raised
            : withAlpha(role.base, 'faint'),
          borderColor: item.read ? t.color.border.subtle : role.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {!item.read && (
        <View
          style={[styles.unreadDot, { backgroundColor: t.color.brand.base }]}
          accessibilityLabel="Unread"
        />
      )}

      <View style={[styles.iconBox, { backgroundColor: role.surface }]}>
        <Icon name={iconName} size={20} color={role.base} />
      </View>

      <View style={styles.contentCol}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.cardTitle,
              {
                color: t.color.text.primary,
                fontWeight: item.read ? '500' : '700',
              },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[styles.cardTime, { color: t.color.text.tertiary }]}>
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
        <Text
          style={[styles.cardBody, { color: t.color.text.secondary }]}
          numberOfLines={2}
        >
          {item.body}
        </Text>
      </View>

      <Pressable
        onPress={() => {
          hapticLight();
          onDelete(item.id);
        }}
        hitSlop={12}
        accessibilityLabel={`Delete notification: ${item.title}`}
        accessibilityRole="button"
        style={styles.deleteBtn}
      >
        <Icon name="close" size={16} color={t.color.text.tertiary} />
      </Pressable>
    </Pressable>
  );
});
NotificationCard.displayName = 'NotificationCard';

const NotificationsScreen: React.FC = () => {
  const t = useTokens();
  const notifications = useNotificationStore((s) => s.notifications);
  const replaceNotificationsForActiveUser = useNotificationStore((s) => s.replaceNotificationsForActiveUser);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const [clearingAll, setClearingAll] = useState(false);

  const handleCardPress = useCallback((id: string) => {
    markAsRead(id);
  }, [markAsRead]);

  const handleDelete = useCallback(async (id: string) => {
    removeNotification(id);
    try {
      await deleteAlertHistoryItem(id);
    } catch (error) {
      logger.warn('[NotificationsScreen] Failed to delete alert history item:', (error as Error)?.message);
    }
  }, [removeNotification]);

  const handleClearAll = useCallback(async () => {
    setClearingAll(true);
    clearAll();
    setClearingAll(false);

    void clearAlertHistory().catch((error) => {
      logger.warn('[NotificationsScreen] Failed to clear alert history:', (error as Error)?.message);
    });
  }, [clearAll]);

  // Returns the promise; usePullRefresh owns the spinner state so this
  // screen uses the same mechanism as every other list.
  const handleRefresh = useCallback(
    () =>
      fetchAlertHistory(150)
        .then((events) => {
          replaceNotificationsForActiveUser(events.map(mapBackendAlertToNotification));
          markAllAsRead();
        })
        .catch((error) => {
          logger.warn('[NotificationsScreen] Failed to refresh alert history:', (error as Error)?.message);
        }),
    [markAllAsRead, replaceNotificationsForActiveUser],
  );

  const pullRefresh = usePullRefresh(handleRefresh);

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <NotificationCard
        item={item}
        onPress={handleCardPress}
        onDelete={(id) => {
          void handleDelete(id);
        }}
        t={t}
      />
    ),
    [handleCardPress, handleDelete, t],
  );

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.sectionAccent, { backgroundColor: t.color.brand.base }]} />
          <Text style={[styles.screenTitle, { color: t.color.text.primary }]}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: t.color.brand.base }]}>
              <Text style={[styles.badgeText, { color: t.color.text.inverse }]}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
        {notifications.length > 0 && (
          <Pressable
            onPress={() => {
              hapticLight();
              void handleClearAll();
            }}
            hitSlop={8}
            accessibilityLabel="Clear all notifications"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.clearBtn,
              { backgroundColor: t.color.status.danger.surface },
              { opacity: pressed || clearingAll ? 0.7 : 1 },
            ]}
          >
            <Icon name="notification-clear-all" size={16} color={t.color.status.danger.base} />
            <Text style={[styles.clearBtnText, { color: t.color.status.danger.base }]}>
              {clearingAll ? 'Clearing...' : 'Clear All'}
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="bell-off-outline"
            title="No notifications yet"
            description="App restarts, deployments and triggered alerts land here as they happen, so you can catch up on anything you missed."
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
            tintColor={t.color.brand.base}
            colors={[t.color.brand.base]}
          />
        }
        ItemSeparatorComponent={Separator}
      />
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    marginRight: spacing.xs,
  },
  screenTitle: typeScale.title,
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { ...typeScale.caption, fontWeight: '700' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  clearBtnText: { ...typeScale.bodySmall, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: spacing.lg,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 6,
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: { ...typeScale.body, flex: 1 },
  cardTime: typeScale.caption,
  cardBody: { ...typeScale.bodySmall, marginTop: 2 },
  deleteBtn: {
    padding: spacing.xs,
    marginTop: -2,
    marginRight: -4,
  },
  separator: {
    height: spacing.sm,
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxxl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
});

export default NotificationsScreen;

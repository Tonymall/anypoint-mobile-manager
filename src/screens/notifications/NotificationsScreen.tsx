import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Text, useTheme, type MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useNotificationStore } from '../../stores/notificationStore';
import {
  clearAlertHistory,
  deleteAlertHistoryItem,
  fetchAlertHistory,
  mapBackendAlertToNotification,
} from '../../services/backendService';
import logger from '../../utils/logger';
import { anypointColors } from '../../theme';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import type { AppNotification, NotificationAction } from '../../types';

const ACTION_ICONS: Record<NotificationAction, string> = {
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

const ACTION_COLORS: Record<NotificationAction, string> = {
  start: anypointColors.success,
  stop: anypointColors.warning,
  restart: anypointColors.info,
  status_change: anypointColors.info,
  deploy: anypointColors.mulePurple,
  undeploy: anypointColors.warning,
  error: anypointColors.error,
  alert: anypointColors.error,
  info: anypointColors.primary,
};

const NotificationCard: React.FC<{
  item: AppNotification;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  theme: MD3Theme;
}> = React.memo(({ item, onPress, onDelete, theme }) => {
  const iconName = ACTION_ICONS[item.action] ?? 'information-outline';
  const iconColor = ACTION_COLORS[item.action] ?? anypointColors.primary;

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress(item.id);
      }}
      android_ripple={{ color: theme.colors.primaryContainer }}
      accessibilityLabel={`${item.read ? '' : 'Unread '}notification: ${item.title}. ${item.body}. ${formatRelativeTime(item.timestamp)}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to mark as read"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: item.read ? theme.colors.surface : theme.colors.surfaceVariant,
          borderColor: item.read ? theme.colors.outlineVariant : iconColor + '30',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {!item.read && (
        <View
          style={[styles.unreadDot, { backgroundColor: anypointColors.primary }]}
          accessibilityLabel="Unread"
        />
      )}

      <View style={[styles.iconBox, { backgroundColor: iconColor + '15' }]}>
        <Icon name={iconName} size={20} color={iconColor} />
      </View>

      <View style={styles.contentCol}>
        <View style={styles.titleRow}>
          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.onSurface,
              fontWeight: item.read ? '500' : '700',
              flex: 1,
            }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}
          >
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
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
        <Icon
          name="close"
          size={16}
          color={theme.colors.onSurfaceVariant}
          style={{ opacity: 0.5 }}
        />
      </Pressable>
    </Pressable>
  );
});

const EmptyState: React.FC<{ theme: MD3Theme }> = ({ theme }) => (
  <View style={styles.emptyContainer} accessibilityLabel="No notifications yet">
    <View style={[styles.emptyIconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
      <Icon name="bell-off-outline" size={48} color={theme.colors.onSurfaceVariant} />
    </View>
    <Text
      variant="titleMedium"
      style={{ color: theme.colors.onSurface, marginTop: 16, fontWeight: '600' }}
    >
      No notifications yet
    </Text>
    <Text
      variant="bodyMedium"
      style={{
        color: theme.colors.onSurfaceVariant,
        marginTop: 6,
        textAlign: 'center',
        maxWidth: 260,
      }}
    >
      Lifecycle events and alerts will appear here
    </Text>
  </View>
);

const NotificationsScreen: React.FC = () => {
  const theme = useTheme();
  const dynamicStyles = useMemo(() => createDynamicStyles(theme), [theme]);
  const notifications = useNotificationStore((s) => s.notifications);
  const replaceNotificationsForActiveUser = useNotificationStore((s) => s.replaceNotificationsForActiveUser);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const [refreshing, setRefreshing] = useState(false);
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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchAlertHistory(150)
      .then((events) => {
        replaceNotificationsForActiveUser(events.map(mapBackendAlertToNotification));
        markAllAsRead();
      })
      .catch((error) => {
        logger.warn('[NotificationsScreen] Failed to refresh alert history:', (error as Error)?.message);
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [markAllAsRead, replaceNotificationsForActiveUser]);

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <NotificationCard
        item={item}
        onPress={handleCardPress}
        onDelete={(id) => {
          void handleDelete(id);
        }}
        theme={theme}
      />
    ),
    [handleCardPress, handleDelete, theme],
  );

  return (
    <View style={[dynamicStyles.container, { paddingTop: 0 }]}>
      <View style={dynamicStyles.header}>
        <View style={styles.headerLeft}>
          <Text
            variant="headlineSmall"
            style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.3 }}
          >
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: anypointColors.primary }]}>
              <Text style={styles.badgeText}>
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
              dynamicStyles.clearBtn,
              { opacity: pressed || clearingAll ? 0.7 : 1 },
            ]}
          >
            <Icon name="notification-clear-all" size={16} color={anypointColors.error} />
            <Text style={{ color: anypointColors.error, fontSize: 13, fontWeight: '600' }}>
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
        ListEmptyComponent={<EmptyState theme={theme} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[anypointColors.primary]}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
  },
  deleteBtn: {
    padding: 4,
    marginTop: -2,
    marginRight: -4,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIconBox: {
    width: 96,
    height: 96,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const createDynamicStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
    },
    clearBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: anypointColors.error + '12',
    },
  });

export default NotificationsScreen;

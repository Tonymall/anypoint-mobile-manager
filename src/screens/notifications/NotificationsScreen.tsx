// ============================================================
// Notifications Screen — 2026 Modern Dark-First Design
//
// Full notification center with unread indicators, swipe-to-
// delete, pull-to-mark-all-read, and empty state.
// ============================================================

import React, { useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotificationStore } from '../../stores/notificationStore';
import { anypointColors } from '../../theme';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import type { AppNotification, NotificationAction } from '../../types';

// ── Action icon mapping ──
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

// ── Notification Card ──
const NotificationCard: React.FC<{
  item: AppNotification;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  theme: MD3Theme;
}> = React.memo(({ item, onPress, onDelete, theme }) => {
  const iconName = ACTION_ICONS[item.action] ?? 'information-outline';
  const iconColor = ACTION_COLORS[item.action] ?? anypointColors.primary;

  const handlePress = useCallback(() => {
    hapticLight();
    onPress(item.id);
  }, [item.id, onPress]);

  const handleDelete = useCallback(() => {
    hapticLight();
    onDelete(item.id);
  }, [item.id, onDelete]);

  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{ color: theme.colors.primaryContainer }}
      accessibilityLabel={`${item.read ? '' : 'Unread '}notification: ${item.title}. ${item.body}. ${formatRelativeTime(item.timestamp)}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to mark as read"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: item.read
            ? theme.colors.surface
            : theme.colors.surfaceVariant,
          borderColor: item.read
            ? theme.colors.outlineVariant
            : iconColor + '30',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Unread dot */}
      {!item.read && (
        <View
          style={[styles.unreadDot, { backgroundColor: anypointColors.primary }]}
          accessibilityLabel="Unread"
        />
      )}

      {/* Action icon */}
      <View style={[styles.iconBox, { backgroundColor: iconColor + '15' }]}>
        <Icon name={iconName} size={20} color={iconColor} />
      </View>

      {/* Content */}
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

      {/* Delete button */}
      <Pressable
        onPress={handleDelete}
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

// ── Empty State ──
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

// ── Main Screen ──
const NotificationsScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dynamicStyles = useMemo(() => createDynamicStyles(theme), [theme]);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const removeNotification = useNotificationStore((s) => s.removeNotification);

  const handleCardPress = useCallback(
    (id: string) => {
      markAsRead(id);
    },
    [markAsRead],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeNotification(id);
    },
    [removeNotification],
  );

  const handleRefresh = useCallback(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  const handleClearAll = useCallback(() => {
    hapticLight();
    clearAll();
  }, [clearAll]);

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <NotificationCard
        item={item}
        onPress={handleCardPress}
        onDelete={handleDelete}
        theme={theme}
      />
    ),
    [handleCardPress, handleDelete, theme],
  );

  const keyExtractor = useCallback((item: AppNotification) => item.id, []);

  return (
    <View style={[dynamicStyles.container, { paddingTop: insets.top }]}>
      {/* Header */}
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
            onPress={handleClearAll}
            hitSlop={8}
            accessibilityLabel="Clear all notifications"
            accessibilityRole="button"
            style={({ pressed }) => [
              dynamicStyles.clearBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name="notification-clear-all" size={16} color={anypointColors.error} />
            <Text style={{ color: anypointColors.error, fontSize: 13, fontWeight: '600' }}>
              Clear All
            </Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState theme={theme} />}
        refreshControl={
          <RefreshControl
            refreshing={false}
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

// ── Static Styles ──
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

// ── Dynamic Styles (theme-dependent) ──
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

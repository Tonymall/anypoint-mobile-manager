// ============================================================
// Notification Store - Persisted local notification history
// Uses Zustand + AsyncStorage for cross-session persistence
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppNotification } from '../types';

const MAX_NOTIFICATIONS = 200;
const ANONYMOUS_USER_ID = 'anonymous';

interface NotificationState {
  activeUserId: string | null;
  notificationsByUser: Record<string, AppNotification[]>;
  notifications: AppNotification[];
  unreadCount: number;
  permissionGranted: boolean | null;
}

interface NotificationActions {
  setActiveUser: (userId: string | null) => void;
  replaceNotificationsForActiveUser: (notifications: AppNotification[]) => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
  setPermissionGranted: (granted: boolean) => void;
}

function resolveUserKey(userId: string | null | undefined): string {
  return userId || ANONYMOUS_USER_ID;
}

function getUnreadCount(notifications: AppNotification[]): number {
  return notifications.filter((notification) => !notification.read).length;
}

export const useNotificationStore = create<NotificationState & NotificationActions>()(
  persist(
    (set, _get) => ({
      activeUserId: null,
      notificationsByUser: {},
      notifications: [],
      unreadCount: 0,
      permissionGranted: null,

      setActiveUser: (userId) =>
        set((state) => {
          const userKey = resolveUserKey(userId);
          const notifications = state.notificationsByUser[userKey] ?? [];
          return {
            activeUserId: userId,
            notifications,
            unreadCount: getUnreadCount(notifications),
          };
        }),

      replaceNotificationsForActiveUser: (notifications) =>
        set((state) => {
          const userKey = resolveUserKey(state.activeUserId);
          const deduped = notifications.slice(0, MAX_NOTIFICATIONS);
          return {
            notificationsByUser: {
              ...state.notificationsByUser,
              [userKey]: deduped,
            },
            notifications: deduped,
            unreadCount: getUnreadCount(deduped),
          };
        }),

      addNotification: (partial) => {
        const notification: AppNotification = {
          ...partial,
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          read: false,
        };
        set((state) => {
          const userKey = resolveUserKey(state.activeUserId);
          const currentNotifications = state.notificationsByUser[userKey] ?? [];
          const updated = [notification, ...currentNotifications].slice(0, MAX_NOTIFICATIONS);
          return {
            notificationsByUser: {
              ...state.notificationsByUser,
              [userKey]: updated,
            },
            notifications: updated,
            unreadCount: getUnreadCount(updated),
          };
        });
      },

      markAsRead: (id) =>
        set((state) => {
          const userKey = resolveUserKey(state.activeUserId);
          const currentNotifications = state.notificationsByUser[userKey] ?? [];
          const notifications = currentNotifications.map((n) =>
            n.id === id && !n.read ? { ...n, read: true } : n,
          );
          return {
            notificationsByUser: {
              ...state.notificationsByUser,
              [userKey]: notifications,
            },
            notifications,
            unreadCount: getUnreadCount(notifications),
          };
        }),

      markAllAsRead: () =>
        set((state) => {
          const userKey = resolveUserKey(state.activeUserId);
          const notifications = (state.notificationsByUser[userKey] ?? []).map((n) => ({
            ...n,
            read: true,
          }));
          return {
            notificationsByUser: {
              ...state.notificationsByUser,
              [userKey]: notifications,
            },
            notifications,
            unreadCount: 0,
          };
        }),

      clearAll: () =>
        set((state) => {
          const userKey = resolveUserKey(state.activeUserId);
          const notificationsByUser = { ...state.notificationsByUser };
          delete notificationsByUser[userKey];
          return {
            notificationsByUser,
            notifications: [],
            unreadCount: 0,
          };
        }),

      removeNotification: (id) =>
        set((state) => {
          const userKey = resolveUserKey(state.activeUserId);
          const notifications = (state.notificationsByUser[userKey] ?? []).filter((n) => n.id !== id);
          return {
            notificationsByUser: {
              ...state.notificationsByUser,
              [userKey]: notifications,
            },
            notifications,
            unreadCount: getUnreadCount(notifications),
          };
        }),

      setPermissionGranted: (granted) => set({ permissionGranted: granted }),
    }),
    {
      name: 'muleops-notifications',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeUserId: state.activeUserId,
        notificationsByUser: state.notificationsByUser,
        permissionGranted: state.permissionGranted,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const activeUserKey = resolveUserKey(state.activeUserId);
          const notifications = state.notificationsByUser?.[activeUserKey] ?? [];
          state.notifications = notifications;
          state.unreadCount = getUnreadCount(notifications);
        }
      },
    },
  ),
);

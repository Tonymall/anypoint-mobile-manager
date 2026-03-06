// ============================================================
// Notification Store - Persisted local notification history
// Uses Zustand + AsyncStorage for cross-session persistence
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppNotification } from '../types';

const MAX_NOTIFICATIONS = 200;

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  permissionGranted: boolean | null;
}

interface NotificationActions {
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
  setPermissionGranted: (granted: boolean) => void;
}

export const useNotificationStore = create<NotificationState & NotificationActions>()(
  persist(
    (set, _get) => ({
      notifications: [],
      unreadCount: 0,
      permissionGranted: null,

      addNotification: (partial) => {
        const notification: AppNotification = {
          ...partial,
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          read: false,
        };
        set((state) => {
          const updated = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
          return { notifications: updated, unreadCount: state.unreadCount + 1 };
        });
      },

      markAsRead: (id) =>
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id && !n.read ? { ...n, read: true } : n,
          );
          const unreadCount = notifications.filter((n) => !n.read).length;
          return { notifications, unreadCount };
        }),

      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),

      clearAll: () => set({ notifications: [], unreadCount: 0 }),

      removeNotification: (id) =>
        set((state) => {
          const notifications = state.notifications.filter((n) => n.id !== id);
          const unreadCount = notifications.filter((n) => !n.read).length;
          return { notifications, unreadCount };
        }),

      setPermissionGranted: (granted) => set({ permissionGranted: granted }),
    }),
    {
      name: 'muleops-notifications',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        notifications: state.notifications,
        permissionGranted: state.permissionGranted,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.unreadCount = state.notifications.filter((n: AppNotification) => !n.read).length;
        }
      },
    },
  ),
);

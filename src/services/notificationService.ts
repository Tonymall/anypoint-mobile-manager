// ============================================================
// Notification Service - Local push notification helpers
// Wraps expo-notifications for permission, scheduling, badges.
// Respects the pushNotificationsEnabled setting from appStore.
//
// Important:
// Expo Go on Android SDK 53+ no longer supports the push-notification
// pieces of expo-notifications and will throw during eager import.
// This service lazy-loads the module and safely no-ops in Expo Go.
// ============================================================

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAppStore } from '../stores/appStore';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;

function isExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient'
  );
}

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;
  if (Platform.OS === 'android' && isExpoGo()) return null;

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then(async (Notifications) => {
        if (!notificationHandlerConfigured) {
          Notifications.setNotificationHandler({
            handleNotification: async () => {
              const enabled = useAppStore.getState().settings.pushNotificationsEnabled;
              if (!enabled) {
                return {
                  shouldPlaySound: false,
                  shouldSetBadge: false,
                  shouldShowBanner: false,
                  shouldShowList: false,
                };
              }
              return {
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
              };
            },
          });
          notificationHandlerConfigured = true;
        }

        return Notifications;
      })
      .catch(() => null);
  }

  return notificationsModulePromise;
}

/**
 * Set up the Android notification channel.
 * On Android 8+ (API 26+), notifications must be assigned to a channel.
 * Call this once during app startup.
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.setNotificationChannelAsync('muleops-default', {
    name: 'MuleOps Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00A1E0',
    sound: 'default',
    description: 'Application lifecycle events, deployment alerts, and status changes',
  });
}

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  // Ensure Android channel exists before requesting permissions
  await setupNotificationChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule a local push notification immediately.
 * Skips scheduling entirely when pushNotificationsEnabled is off.
 * On Android, notifications are assigned to the 'muleops-default' channel.
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string> {
  const enabled = useAppStore.getState().settings.pushNotificationsEnabled;
  if (!enabled) return '';
  const Notifications = await getNotificationsModule();
  if (!Notifications) return '';

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'muleops-default' } : {}),
    },
    trigger: null, // Immediately
  });
}

export async function setBadgeCount(count: number): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  await Notifications.setBadgeCountAsync(0);
}

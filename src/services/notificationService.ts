// ============================================================
// Notification Service - Local push notification helpers
// Wraps expo-notifications for permission, scheduling, badges.
// Respects the pushNotificationsEnabled setting from appStore.
// ============================================================

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useAppStore } from '../stores/appStore';

// Configure how notifications are shown when app is foregrounded.
// Checks pushNotificationsEnabled at notification delivery time.
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

/**
 * Set up the Android notification channel.
 * On Android 8+ (API 26+), notifications must be assigned to a channel.
 * Call this once during app startup.
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
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
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}

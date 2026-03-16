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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useAppStore } from '../stores/appStore';
import logger from '../utils/logger';

type NotificationsModule = typeof import('expo-notifications');
const PUSH_INSTALLATION_ID_KEY = 'muleops_push_installation_id';

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

async function ensureNotificationPermission(
  Notifications: NotificationsModule,
): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function getInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, generated);
  return generated;
}

function getExpoProjectId(): string | null {
  const fromEasConfig = (Constants.easConfig as { projectId?: string } | null)?.projectId;
  const fromExpoConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromEasConfig ?? fromExpoConfig ?? null;
}

export interface RemotePushRegistration {
  installationId: string;
  expoPushToken: string;
}

export async function getRemotePushRegistration(): Promise<RemotePushRegistration | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return null;
  }

  const permissionGranted = await ensureNotificationPermission(Notifications);
  if (!permissionGranted) {
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    logger.warn('[Notifications] Missing Expo projectId, remote push registration skipped');
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenResponse.data) {
      return null;
    }

    return {
      installationId: await getInstallationId(),
      expoPushToken: tokenResponse.data,
    };
  } catch (error) {
    logger.warn('[Notifications] Failed to get Expo push token:', (error as Error)?.message);
    return null;
  }
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
  return ensureNotificationPermission(Notifications);
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
  const permissionGranted = await ensureNotificationPermission(Notifications);
  if (!permissionGranted) return '';

  const content: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound: 'default';
    channelId?: string;
  } = {
    title,
    body,
    sound: 'default',
    ...(Platform.OS === 'android' ? { channelId: 'muleops-default' } : {}),
  };

  if (data && Object.keys(data).length > 0) {
    content.data = data;
  }

  return Notifications.scheduleNotificationAsync({
    content,
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

import {
  listDevicePushTokensForUser,
  removeDevicePushTokensByExpoToken,
} from './storage/devicePushTokens';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessageInput {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  details?: {
    error?: string;
  };
}

export async function sendPushNotificationToUser(
  userId: string,
  message: PushMessageInput,
): Promise<void> {
  const devices = await listDevicePushTokensForUser(userId);
  if (devices.length === 0) {
    return;
  }

  const payload = devices.map((device) => ({
    to: device.expoPushToken,
    sound: 'default',
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Expo push send failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const json = await response.json() as { data?: ExpoPushTicket[] };
  const tickets = Array.isArray(json.data) ? json.data : [];
  const invalidTokens: string[] = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const token = devices[index]?.expoPushToken;
      if (token) {
        invalidTokens.push(token);
      }
    }
  });

  if (invalidTokens.length > 0) {
    await removeDevicePushTokensByExpoToken(invalidTokens);
  }
}

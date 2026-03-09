/**
 * Notification Store Smoke Tests
 *
 * Verifies notification store behaviors:
 * - Adding notifications
 * - Marking as read
 * - Clearing all notifications (used on logout)
 * - Unread count tracking
 */

import { useNotificationStore } from '../stores/notificationStore';

// Reset store before each test
beforeEach(() => {
  useNotificationStore.getState().setActiveUser('test-user');
  useNotificationStore.getState().clearAll();
});

describe('Notification Store', () => {
  it('should start with empty notifications', () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });

  it('should add a notification and increment unread count', () => {
    useNotificationStore.getState().addNotification({
      type: 'lifecycle',
      action: 'start',
      title: 'Application Starting',
      body: 'test-app is being started',
      applicationName: 'test-app',
      domain: 'test-app',
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.unreadCount).toBe(1);
    expect(state.notifications[0].title).toBe('Application Starting');
    expect(state.notifications[0].read).toBe(false);
  });

  it('should mark a notification as read', () => {
    useNotificationStore.getState().addNotification({
      type: 'deployment',
      action: 'status_change',
      title: 'Application Deployed',
      body: 'test-app deployed',
      applicationName: 'test-app',
      domain: 'test-app',
    });

    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().markAsRead(id);

    const state = useNotificationStore.getState();
    expect(state.notifications[0].read).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it('should clear all notifications for the active user', () => {
    // Add multiple notifications
    for (let i = 0; i < 5; i++) {
      useNotificationStore.getState().addNotification({
        type: 'lifecycle',
        action: 'stop',
        title: `Notification ${i}`,
        body: `Body ${i}`,
        applicationName: 'app',
        domain: 'app',
      });
    }

    expect(useNotificationStore.getState().notifications).toHaveLength(5);
    expect(useNotificationStore.getState().unreadCount).toBe(5);

    // Clear all — simulates logout
    useNotificationStore.getState().clearAll();

    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });

  it('should mark all as read', () => {
    for (let i = 0; i < 3; i++) {
      useNotificationStore.getState().addNotification({
        type: 'lifecycle',
        action: 'restart',
        title: `Notification ${i}`,
        body: `Body ${i}`,
        applicationName: 'app',
        domain: 'app',
      });
    }

    useNotificationStore.getState().markAllAsRead();

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.read)).toBe(true);
  });

  it('should cap notifications at 200', () => {
    for (let i = 0; i < 210; i++) {
      useNotificationStore.getState().addNotification({
        type: 'lifecycle',
        action: 'start',
        title: `Notification ${i}`,
        body: `Body ${i}`,
        applicationName: 'app',
        domain: 'app',
      });
    }

    expect(useNotificationStore.getState().notifications.length).toBeLessThanOrEqual(200);
  });
});

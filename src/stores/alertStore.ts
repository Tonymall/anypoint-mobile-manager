// ============================================================
// Anypoint Mobile Platform - Alert Store
// Manages alerts, alert rules, and unread notification counts
// ============================================================

import { create } from 'zustand';

import type {
  Alert,
  AlertRule,
  AlertStatus,
} from '../types';

// --- State ---
export interface AlertState {
  alerts: Alert[];
  alertRules: AlertRule[];
  unreadCount: number;
  isLoading: boolean;
}

// --- Actions ---
export interface AlertActions {
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (alertId: string, acknowledgedBy: string) => void;
  resolveAlert: (alertId: string) => void;
  dismissAlert: (alertId: string) => void;
  setAlertRules: (rules: AlertRule[]) => void;
  incrementUnread: (count?: number) => void;
  clearUnread: () => void;
  setIsLoading: (isLoading: boolean) => void;
  updateAlertStatus: (alertId: string, status: AlertStatus) => void;
}

// --- Initial State ---
const initialState: AlertState = {
  alerts: [],
  alertRules: [],
  unreadCount: 0,
  isLoading: false,
};

// --- Store ---
export const useAlertStore = create<AlertState & AlertActions>()(
  (set) => ({
    ...initialState,

    setAlerts: (alerts: Alert[]) =>
      set({
        alerts,
      }),

    addAlert: (alert: Alert) =>
      set((state) => ({
        alerts: [alert, ...state.alerts],
        unreadCount: state.unreadCount + 1,
      })),

    acknowledgeAlert: (alertId: string, acknowledgedBy: string) =>
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? {
                ...alert,
                status: 'ACKNOWLEDGED' as const,
                acknowledgedBy,
                updatedAt: new Date().toISOString(),
              }
            : alert,
        ),
      })),

    resolveAlert: (alertId: string) =>
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? {
                ...alert,
                status: 'RESOLVED' as const,
                resolvedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : alert,
        ),
      })),

    dismissAlert: (alertId: string) =>
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? {
                ...alert,
                status: 'DISMISSED' as const,
                updatedAt: new Date().toISOString(),
              }
            : alert,
        ),
      })),

    setAlertRules: (rules: AlertRule[]) =>
      set({
        alertRules: rules,
      }),

    incrementUnread: (count = 1) =>
      set((state) => ({
        unreadCount: state.unreadCount + count,
      })),

    clearUnread: () =>
      set({
        unreadCount: 0,
      }),

    setIsLoading: (isLoading: boolean) =>
      set({
        isLoading,
      }),

    updateAlertStatus: (alertId: string, status: AlertStatus) =>
      set((state) => ({
        alerts: state.alerts.map((alert) =>
          alert.id === alertId
            ? {
                ...alert,
                status,
                updatedAt: new Date().toISOString(),
              }
            : alert,
        ),
      })),
  }),
);

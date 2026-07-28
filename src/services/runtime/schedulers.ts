// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Schedulers: list, enable/disable, and run-now operations
// ============================================================

import api from '../api';
import { CLOUDHUB_BASE } from './shared';

// ---------- Schedulers ----------

export interface Schedule {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  flowName: string;
  cronExpression?: string;
  frequency?: string;
  timeUnit?: string;
  startDelay?: string;
  lastRun?: string;
  nextRun?: string;
}

/**
 * List all schedulers for an application.
 * Tries v2 first, then falls back to v1 path.
 */
export async function getSchedulers(domain: string): Promise<Schedule[]> {
  const extractSchedules = (data: any): Schedule[] => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const d = data as any;
      return d.data ?? d.schedules ?? d.items ?? [];
    }
    return [];
  };

  try {
    const { data } = await api.get(
      `${CLOUDHUB_BASE}/applications/${domain}/schedules`,
    );
    return extractSchedules(data);
  } catch (err: any) {
    if (err?.response?.status === 404) {
      try {
        const { data } = await api.get(
          `/cloudhub/api/applications/${domain}/schedules`,
        );
        return extractSchedules(data);
      } catch (v1Err: any) {
        if (v1Err?.response?.status === 404) {
          return [];
        }
        throw v1Err;
      }
    }
    throw err;
  }
}

/**
 * Enable or disable a scheduler. Tries v2, falls back to v1.
 */
export async function updateScheduler(
  domain: string,
  scheduleId: string,
  enabled: boolean,
): Promise<void> {
  try {
    await api.put(
      `${CLOUDHUB_BASE}/applications/${domain}/schedules/${scheduleId}`,
      { enabled },
    );
  } catch (err: any) {
    if (err?.response?.status === 404) {
      await api.put(
        `/cloudhub/api/applications/${domain}/schedules/${scheduleId}`,
        { enabled },
      );
      return;
    }
    throw err;
  }
}

/**
 * Run a scheduler immediately. Tries v2, falls back to v1.
 */
export async function runScheduler(
  domain: string,
  scheduleId: string,
): Promise<void> {
  try {
    await api.post(
      `${CLOUDHUB_BASE}/applications/${domain}/schedules/${scheduleId}/run`,
    );
  } catch (err: any) {
    if (err?.response?.status === 404) {
      await api.post(
        `/cloudhub/api/applications/${domain}/schedules/${scheduleId}/run`,
      );
      return;
    }
    throw err;
  }
}

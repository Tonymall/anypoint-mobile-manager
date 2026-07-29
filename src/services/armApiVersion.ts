// ============================================================
// Anypoint Mobile Platform - ARM API version negotiation
// ============================================================
// The Anypoint web console calls /armui/api/v2 for applications,
// servers, alerts, users and permissions. Older tenants may still
// only serve v1, and we cannot tell which a given control plane
// supports without asking.
//
// Strategy: prefer v2, and if a *collection* endpoint answers 404
// or 405, fall back to v1 once and pin that choice for the session.
// Negotiation is deliberately restricted to collection endpoints —
// an item endpoint can legitimately 404 for a missing resource, and
// pinning a version from that would be wrong.
// ============================================================

import type { AxiosRequestConfig } from 'axios';

import api from './api';
import logger from '../utils/logger';
import {
  PREFERRED_ARM_VERSION,
  getArmVersion,
  pinArmVersion,
  type ArmApiVersion,
} from './armApiVersionState';

export {
  getArmBase,
  getArmVersion,
  resetArmVersion,
  type ArmApiVersion,
} from './armApiVersionState';

function isVersionMiss(error: any): boolean {
  const status = error?.response?.status;
  return status === 404 || status === 405;
}

/**
 * GET an ARM *collection* endpoint, negotiating the API version once.
 * `path` is the part after the version segment, e.g. '/servers'.
 */
export async function armGetCollection<T>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const pinned = getArmVersion();
  if (pinned) {
    const { data } = await api.get<T>(`/armui/api/${pinned}${path}`, config);
    return data;
  }

  try {
    const { data } = await api.get<T>(
      `/armui/api/${PREFERRED_ARM_VERSION}${path}`,
      config,
    );
    pinArmVersion(PREFERRED_ARM_VERSION);
    return data;
  } catch (error: any) {
    if (!isVersionMiss(error)) throw error;

    const fallback: ArmApiVersion = PREFERRED_ARM_VERSION === 'v2' ? 'v1' : 'v2';
    logger.warn(
      `[ARM] ${PREFERRED_ARM_VERSION}${path} returned ${error?.response?.status}; falling back to ${fallback}`,
    );
    const { data } = await api.get<T>(`/armui/api/${fallback}${path}`, config);
    pinArmVersion(fallback);
    return data;
  }
}

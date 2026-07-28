// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Shared constants + helpers (base paths, org/env header access,
// AMC path builders, CH2 deployment normalization)
// ============================================================

import api from '../api';
import type { Application } from '../../types';

export const CLOUDHUB_BASE = '/cloudhub/api/v2';
export const CLOUDHUB_V1 = '/cloudhub/api';
const _RUNTIME_BASE = '/armui/api/v1';
export const AMC_BASE = '/amc/application-manager/api/v2';
export const HYBRID_BASE = '/hybrid/api/v1';

// ---------- Helpers: read org/env from API headers ----------

export function getOrgId(): string | undefined {
  return api.defaults.headers.common['X-ANYPNT-ORG-ID'] as string | undefined;
}

export function getEnvId(): string | undefined {
  return api.defaults.headers.common['X-ANYPNT-ENV-ID'] as string | undefined;
}

/** Build the AMC base path for the current org/env (CloudHub 2.0) */
export function amcDeploymentsPath(): string | null {
  const orgId = getOrgId();
  const envId = getEnvId();
  if (!orgId || !envId) return null;
  return `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
}

/**
 * Match a CH2/AMC deployment object against a domain string.
 * Checks name, id, nested application fields, fullDomain, and partial matches.
 */
export function matchDeployment(dep: any, domain: string): boolean {
  if (dep.name === domain || dep.id === domain) return true;
  if (dep.application?.ref?.artifactId === domain) return true;
  if (dep.application?.name === domain) return true;
  if (dep.fullDomain === domain || dep.application?.fullDomain === domain) return true;
  const dName = dep.name ?? '';
  if (dName && (dName.includes(domain) || domain.includes(dName))) return true;
  return false;
}

// ---------- CH2 Deployment → Application normalizer ----------

/** Format CH2 CPU/memory limits into a readable worker type name */
export function formatCh2WorkerType(cpu: string, memory: string): string {
  if (!cpu && !memory) return 'worker';
  const parts: string[] = [];
  if (cpu) {
    // CH2 uses millicores like "1500m" = 1.5 vCores, or plain "1"
    if (cpu.endsWith('m')) {
      const cores = parseFloat(cpu) / 1000;
      parts.push(`${cores} vCores`);
    } else {
      parts.push(`${cpu} vCores`);
    }
  }
  if (memory) parts.push(memory);
  return parts.join(' / ') || 'worker';
}

/**
 * Normalize a CloudHub 2.0 deployment object into our Application interface
 * so the rest of the app can work with a unified shape.
 */
export function normalizeDeployment(dep: any): Application {
  const app = dep?.application ?? {};
  const target = dep?.target ?? {};
  const ref = app?.ref ?? {};
  const replicasArr = dep?.replicas ?? [];

  // CH2 status mapping
  let status = app?.status ?? dep?.status ?? 'UNKNOWN';
  // Normalize CH2-specific statuses
  if (status === 'RUNNING') status = 'STARTED';
  else if (status === 'NOT_RUNNING' || status === 'UNDEPLOYED') status = 'STOPPED';
  else if (status === 'APPLYING' || status === 'DEPLOYING') status = 'DEPLOYING';
  else if (status === 'FAILED' || status === 'DEPLOYMENT_FAILED') status = 'DEPLOY_FAILED';

  // Runtime version — check multiple possible locations
  const runtimeVersion =
    target?.deploymentSettings?.runtimeVersion ??
    target?.deploymentSettings?.runtime?.version ??
    dep?.currentRuntimeVersion ??
    app?.configuration?.['mule.agent.application.properties.service']?.muleVersion ??
    app?.vcs?.tag ?? '';

  // Worker / replica info
  const cpuLimit = target?.deploymentSettings?.resources?.cpu?.limit ?? '';
  const memLimit = target?.deploymentSettings?.resources?.memory?.limit ?? '';
  const cpuReserved = target?.deploymentSettings?.resources?.cpu?.reserved ?? '';
  const memReserved = target?.deploymentSettings?.resources?.memory?.reserved ?? '';
  const replicaCount = typeof target?.replicas === 'number'
    ? target.replicas
    : (Array.isArray(replicasArr) && replicasArr.length > 0 ? replicasArr.length : 1);

  // Extract monitoring from replica statuses if available
  const firstReplica = Array.isArray(replicasArr) ? replicasArr[0] : null;
  const _replicaState = firstReplica?.state ?? firstReplica?.status ?? '';

  return {
    id: dep.id ?? '',
    name: dep.name ?? ref.artifactId ?? '',
    domain: dep.name ?? dep.id ?? '',
    fullDomain: dep.name ?? '',
    status,
    deploymentTarget: 'cloudhub2',
    lastUpdateTime: dep.lastModifiedDate ?? dep.updatedDate ?? dep.createdDate ?? '',
    fileName: ref.artifactId ? `${ref.artifactId}-${ref.version}.jar` : '',
    muleVersion: runtimeVersion,
    region: target?.provider ?? target?.targetId ?? '',
    workers: {
      type: {
        name: formatCh2WorkerType(cpuLimit || cpuReserved, memLimit || memReserved),
        weight: 1,
        cpu: cpuLimit || cpuReserved,
        memory: memLimit || memReserved,
      },
      amount: replicaCount,
      remainingOrgWorkers: 0,
    },
    monitoring: {
      cpuUsage: 0,
      memoryUsage: 0,
      memoryTotal: 0,
      threadCount: 0,
    },
    properties: app?.configuration?.['mule.agent.application.properties.service']?.properties ?? {},
    persistentQueues: false,
    loggingEnabled: true,
    // Preserve the original CH2 object for lifecycle operations
    _ch2Deployment: dep,
  } as any;
}

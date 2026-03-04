/**
 * Helpers for normalizing CloudHub API response fields.
 * The real API returns slightly different field names/structures
 * than our internal Application type.
 */

/** Get display name for an application */
export function getAppName(app: any): string {
  return app?.name ?? app?.domain ?? 'Unknown App';
}

/** Get unique identifier for an application */
export function getAppId(app: any): string {
  return app?.domain ?? app?.id ?? String(Math.random());
}

/** Get muleVersion as a string (API returns object or string) */
export function getMuleVersion(app: any): string {
  if (!app?.muleVersion) return '';
  if (typeof app.muleVersion === 'string') return app.muleVersion;
  if (typeof app.muleVersion === 'object' && app.muleVersion.version) {
    return app.muleVersion.version;
  }
  return String(app.muleVersion);
}

/** Get deployment target with fallback */
export function getDeploymentTarget(app: any): string {
  return app?.deploymentTarget ?? app?.target?.type ?? 'cloudhub';
}

/** Get formatted last update time */
export function getLastUpdateTime(app: any): string {
  const raw = app?.lastUpdateTime;
  if (!raw) return '';
  // Handle both timestamp number and ISO string
  if (typeof raw === 'number') return new Date(raw).toISOString();
  return String(raw);
}

/** Get worker info safely */
export function getWorkerInfo(app: any): { amount: number; typeName: string } {
  const workers = app?.workers;
  if (!workers) return { amount: 1, typeName: 'worker' };
  return {
    amount: workers.amount ?? 1,
    typeName: workers.type?.name ?? 'worker',
  };
}

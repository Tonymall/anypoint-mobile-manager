// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Supports both CloudHub 1.0 and CloudHub 2.0 (AMC) APIs
//
// This file is a barrel: the implementation lives in the domain
// modules under ./runtime (shared, state, applications, logs,
// schedulers, monitoring). It re-exports the public API so all
// existing imports keep working unchanged.
// ============================================================

// ---------- Applications ----------
export {
  getApplications,
  getApplicationsForEnvironment,
  getApplication,
  startApp,
  stopApp,
  restartApp,
  deployApplication,
  deleteApplication,
  scaleWorkers,
  updateProperties,
} from './runtime/applications';

// ---------- Logs ----------
export {
  areLogEndpointsAvailable,
  getAppLogs,
} from './runtime/logs';

// ---------- Schedulers ----------
export type { Schedule } from './runtime/schedulers';
export {
  getSchedulers,
  updateScheduler,
  runScheduler,
} from './runtime/schedulers';

// ---------- Metrics / Dashboard Stats ----------
export {
  isMonitoringUnavailable,
  resetSessionFlags,
  getDashboardStats,
  getAppMetrics,
} from './runtime/monitoring';

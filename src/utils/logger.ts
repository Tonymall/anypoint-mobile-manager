// ============================================================
// Production-safe logger
// In __DEV__ mode, logs to console. In production, no-ops.
// This prevents sensitive auth/operational context from leaking
// into production logs.
// ============================================================

/* eslint-disable no-console */

export const logger = {
  log: (...args: any[]) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args: any[]) => {
    // Errors are always logged (they indicate real problems)
    console.error(...args);
  },
  info: (...args: any[]) => {
    if (__DEV__) console.info(...args);
  },
};

export default logger;

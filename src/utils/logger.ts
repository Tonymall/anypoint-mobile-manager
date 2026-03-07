// ============================================================
// Production-safe logger
// In __DEV__ mode, logs stay visible without triggering the red
// error surface for handled application errors. In production,
// logs no-op to avoid leaking sensitive context.
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
    if (__DEV__) console.warn(...args);
  },
  info: (...args: any[]) => {
    if (__DEV__) console.info(...args);
  },
};

export default logger;

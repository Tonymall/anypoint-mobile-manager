// ═══════════════════════════════════════════════════════════════════
// Monitoring — metric extraction
// ═══════════════════════════════════════════════════════════════════
// Normalises the several shapes the platform returns for per-app
// telemetry (CloudHub dashboardStats, Anypoint Monitoring time-series,
// the Observability Metrics API, InfluxDB passthrough, CH2 replicas)
// into one flat record the cards can read.
//
// Extracted verbatim from MonitoringScreen so the screen file is about
// layout and this file is about data shapes.
// ═══════════════════════════════════════════════════════════════════


export interface MonitoringMetrics {
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryUsedMB: number | null;
  memoryTotalMB: number | null;
  threadCount: number | null;
  classesLoaded: number | null;
  gcCollections: number | null;
  gcTime: number | null;
  heapUsed: number | null;
  heapCommitted: number | null;
  nonHeapUsed: number | null;
  // App-level metrics (from Observability/Metrics API)
  inboundRequestCount: number | null;
  inboundAvgResponseTime: number | null;
  outboundRequestCount: number | null;
  outboundAvgResponseTime: number | null;
  messageCount: number | null;
  errorCount: number | null;
}

export function extractMetrics(detailedApp: any, dashStats: any): MonitoringMetrics {
  const metrics: MonitoringMetrics = {
    cpuPercent: null,
    memoryPercent: null,
    memoryUsedMB: null,
    memoryTotalMB: null,
    threadCount: null,
    classesLoaded: null,
    gcCollections: null,
    gcTime: null,
    heapUsed: null,
    heapCommitted: null,
    nonHeapUsed: null,
    inboundRequestCount: null,
    inboundAvgResponseTime: null,
    outboundRequestCount: null,
    outboundAvgResponseTime: null,
    messageCount: null,
    errorCount: null,
  };

  // Source 0: `monitoring` field from the Application type definition
  if (detailedApp?.monitoring) {
    const mon = detailedApp.monitoring;
    if (mon.cpuUsage != null) metrics.cpuPercent = Number(mon.cpuUsage);
    if (mon.memoryUsage != null) metrics.memoryUsedMB = Number(mon.memoryUsage);
    if (mon.memoryTotal != null) metrics.memoryTotalMB = Number(mon.memoryTotal);
    if (mon.threadCount != null) metrics.threadCount = Number(mon.threadCount);
    if (mon.memoryTotal > 0 && mon.memoryUsage != null) {
      metrics.memoryPercent = Math.round((mon.memoryUsage / mon.memoryTotal) * 100);
    }
  }

  // Source 1: workerStatuses from detailed app (can be array or keyed object)
  // statisticsByWorker values can be time-series maps { "ts": value } or plain numbers
  if (detailedApp) {
    const raw = detailedApp.workerStatuses ?? detailedApp.workers?.statuses;
    const workerArr: any[] = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object') ? Object.values(raw) : [];

    if (workerArr.length > 0) {
      let w = workerArr[0]?.statisticsByWorker ?? workerArr[0]?.statistics ?? workerArr[0] ?? {};
      // statisticsByWorker may be nested by worker ID: { "id-xxx": { cpu: ..., ... } }
      const metricKeys = ['cpu', 'cpuPercentageUsed', 'memoryTotalUsed', 'memoryPercentageUsed', 'threadCount'];
      const hasDirectMetric = metricKeys.some((k) => k in w);
      if (!hasDirectMetric) {
        const vals = Object.values(w);
        if (vals.length > 0 && vals[0] && typeof vals[0] === 'object') {
          w = vals[0] as any;
        }
      }

      // Helper: extract latest numeric value from a possible time-series map
      const numVal = (field: any): number | null => {
        if (field == null) return null;
        if (typeof field === 'number') return field;
        if (typeof field === 'object' && !Array.isArray(field)) {
          const ks = Object.keys(field);
          if (ks.length === 0) return null;
          const sorted = ks.sort((a, b) => Number(b) - Number(a));
          const v = field[sorted[0]];
          return typeof v === 'number' ? v : null;
        }
        return null;
      };

      if (metrics.cpuPercent == null) metrics.cpuPercent = numVal(w.cpuPercentageUsed) ?? numVal(w.cpu);
      if (metrics.memoryPercent == null) metrics.memoryPercent = numVal(w.memoryPercentageUsed);
      if (metrics.memoryUsedMB == null) metrics.memoryUsedMB = numVal(w.memoryTotalUsed);
      if (metrics.memoryTotalMB == null) metrics.memoryTotalMB = numVal(w.memoryTotalMax);
      if (metrics.threadCount == null) metrics.threadCount = numVal(w.threadCount);

      // JVM from worker statuses
      if (metrics.heapUsed == null) metrics.heapUsed = numVal(w.heapUsed);
      if (metrics.heapCommitted == null) metrics.heapCommitted = numVal(w.heapCommitted);
      if (metrics.nonHeapUsed == null) metrics.nonHeapUsed = numVal(w.nonHeapUsed);
      if (metrics.classesLoaded == null) metrics.classesLoaded = numVal(w.classesLoaded);
      if (metrics.gcCollections == null) metrics.gcCollections = numVal(w.totalGarbageCollections);
      if (metrics.gcTime == null) metrics.gcTime = numVal(w.garbageCollectionTime);
    }
  }

  // Source 2: dashboardStats
  // The CloudHub dashboardStats response looks like:
  // {
  //   "workerStatistics": [
  //     {
  //       "id": "i-xxx",
  //       "statistics": {
  //         "cpu": { "1556825280000": 1.475, "1556825340000": 1.5 },
  //         "memoryTotalUsed": { "ts": bytes, ... },
  //         "memoryPercentageUsed": { "ts": pct, ... },
  //         "memoryTotalMax": 992215040.0   <-- single number, NOT a map
  //       }
  //     }
  //   ]
  // }
  if (dashStats) {
    // Helper: extract the latest value from a time-series map { "timestamp": value }
    // or return the value directly if it's already a number
    const latestVal = (field: any): number | null => {
      if (field == null) return null;
      if (typeof field === 'number') return field;
      if (typeof field === 'object' && !Array.isArray(field)) {
        const keys = Object.keys(field);
        if (keys.length === 0) return null;
        // Sort by timestamp (numeric key) and return the latest
        const sortedKeys = keys.sort((a, b) => Number(b) - Number(a));
        return Number(field[sortedKeys[0]]);
      }
      return null;
    };

    // Parse workerStatistics array (the actual CloudHub response format)
    const workerStats = dashStats.workerStatistics;
    if (Array.isArray(workerStats) && workerStats.length > 0) {
      const stats = workerStats[0]?.statistics ?? workerStats[0] ?? {};

      if (metrics.cpuPercent == null) {
        metrics.cpuPercent = latestVal(stats.cpu);
      }
      if (metrics.memoryPercent == null) {
        metrics.memoryPercent = latestVal(stats.memoryPercentageUsed);
      }
      if (metrics.memoryUsedMB == null) {
        const usedBytes = latestVal(stats.memoryTotalUsed);
        if (usedBytes != null) metrics.memoryUsedMB = usedBytes;
      }
      if (metrics.memoryTotalMB == null) {
        // memoryTotalMax is a single number, not a time series
        const maxBytes = typeof stats.memoryTotalMax === 'number'
          ? stats.memoryTotalMax
          : latestVal(stats.memoryTotalMax);
        if (maxBytes != null) metrics.memoryTotalMB = maxBytes;
      }
    }

    // Fallback: check if dashStats itself has flat metric fields
    // (older API versions or different response shapes)
    const flat = dashStats.workerStatistics?.[0]?.statistics
      ?? dashStats.workerStatistics?.[0]
      ?? dashStats;
    if (typeof flat === 'object' && !Array.isArray(flat)) {
      if (metrics.cpuPercent == null && flat.cpuPercentageUsed != null) {
        metrics.cpuPercent = Number(flat.cpuPercentageUsed);
      }
      if (metrics.memoryPercent == null && flat.memoryPercentageUsed != null && typeof flat.memoryPercentageUsed === 'number') {
        metrics.memoryPercent = Number(flat.memoryPercentageUsed);
      }
    }

    // Handle Anypoint Monitoring time-series response shape
    // (array of { target, datapoints: [[value, timestamp], ...] })
    if (Array.isArray(dashStats)) {
      for (const series of dashStats) {
        const target = series?.target ?? '';
        const points = series?.datapoints ?? series?.data ?? [];
        if (points.length === 0) continue;
        const lastPoint = points[points.length - 1];
        const value = Array.isArray(lastPoint) ? lastPoint[0] : lastPoint?.value;
        if (value == null) continue;

        if (target.includes('cpu') && metrics.cpuPercent == null) {
          metrics.cpuPercent = Number(value);
        } else if (target.includes('memory') && metrics.memoryPercent == null) {
          metrics.memoryPercent = Number(value);
        } else if (target.includes('thread') && metrics.threadCount == null) {
          metrics.threadCount = Number(value);
        }
      }
    }

    // Handle Observability Metrics API AMQL response shape
    if (dashStats?.data && Array.isArray(dashStats.data)) {
      for (const row of dashStats.data) {
        const m = row?.measurements ?? row;
        if (m?.cpuUsage != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(m.cpuUsage);
        if (m?.cpuPercentageUsed != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(m.cpuPercentageUsed);
        if (m?.memoryUsage != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(m.memoryUsage);
        if (m?.memoryPercentageUsed != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(m.memoryPercentageUsed);
        if (m?.threadCount != null && metrics.threadCount == null) metrics.threadCount = Number(m.threadCount);
      }
    }

    // Handle CH2 deployment detail response (from AMC API)
    // These may contain replica-level info but not live CPU/memory
    if (dashStats?.target || dashStats?.application) {
      const target = dashStats.target ?? {};
      const resources = target?.deploymentSettings?.resources ?? {};
      const cpuLimit = resources?.cpu?.limit ?? '';
      const _memLimit = resources?.memory?.limit ?? '';
      // If we found resource configs, set them as "configured" values
      // (these aren't live metrics, but better than nothing)
      if (cpuLimit && metrics.cpuPercent == null) {
        // Don't set CPU percent from config — it's not a live metric
      }
      // Check replica statuses for any runtime metrics
      const replicas = dashStats.replicas ?? [];
      if (Array.isArray(replicas)) {
        for (const replica of replicas) {
          const stats = replica?.statistics ?? replica?.metrics ?? {};
          if (stats.cpu != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(stats.cpu);
          if (stats.memory != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(stats.memory);
        }
      }
    }
  }

  // ── Handle InfluxDB extra metrics (from _extraMetrics field) ──
  if (dashStats?._extraMetrics) {
    const ex = dashStats._extraMetrics;
    if (ex.cpuPercent != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(ex.cpuPercent);
    if (ex.memoryPercent != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(ex.memoryPercent);
    if (ex.memoryUsed != null && metrics.memoryUsedMB == null) {
      const used = Number(ex.memoryUsed);
      metrics.memoryUsedMB = used > 10_000 ? used / (1024 * 1024) : used;
    }
    if (ex.memoryTotal != null && metrics.memoryTotalMB == null) {
      const total = Number(ex.memoryTotal);
      metrics.memoryTotalMB = total > 10_000 ? total / (1024 * 1024) : total;
    }
    if (ex.threadCount != null && metrics.threadCount == null) metrics.threadCount = Number(ex.threadCount);
    if (ex.heapUsed != null && metrics.heapUsed == null) metrics.heapUsed = Number(ex.heapUsed);
    if (ex.heapCommitted != null && metrics.heapCommitted == null) metrics.heapCommitted = Number(ex.heapCommitted);
    if (ex.gcCollections != null && metrics.gcCollections == null) metrics.gcCollections = Number(ex.gcCollections);
    if (ex.gcTime != null && metrics.gcTime == null) metrics.gcTime = Number(ex.gcTime);
    if (ex.nonHeapUsed != null && metrics.nonHeapUsed == null) metrics.nonHeapUsed = Number(ex.nonHeapUsed);
    if (ex.classesLoaded != null && metrics.classesLoaded == null) metrics.classesLoaded = Number(ex.classesLoaded);
    // HTTP metrics from InfluxDB
    if (ex.inboundRequestCount != null && metrics.inboundRequestCount == null) metrics.inboundRequestCount = Number(ex.inboundRequestCount);
    if (ex.inboundAvgResponseTime != null && metrics.inboundAvgResponseTime == null) metrics.inboundAvgResponseTime = Number(ex.inboundAvgResponseTime);
    if (ex.outboundRequestCount != null && metrics.outboundRequestCount == null) metrics.outboundRequestCount = Number(ex.outboundRequestCount);
    if (ex.outboundAvgResponseTime != null && metrics.outboundAvgResponseTime == null) metrics.outboundAvgResponseTime = Number(ex.outboundAvgResponseTime);
    if (ex.messageCount != null && metrics.messageCount == null) metrics.messageCount = Number(ex.messageCount);
  }

  // ── Handle normalized time-series from InfluxDB / Observability ──
  if (Array.isArray(dashStats?._timeSeries) && dashStats._timeSeries.length > 0) {
    const latestPoint = [...dashStats._timeSeries]
      .filter((point: any) => point?.timestamp != null)
      .sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp))[0];

    if (latestPoint) {
      if (metrics.cpuPercent == null && latestPoint.cpu != null) {
        metrics.cpuPercent = Number(latestPoint.cpu);
      }
      if (metrics.memoryPercent == null && latestPoint.memory != null) {
        metrics.memoryPercent = Number(latestPoint.memory);
      }
      if (metrics.heapUsed == null && latestPoint.heapUsed != null) {
        metrics.heapUsed = Number(latestPoint.heapUsed);
      }
      if (metrics.heapCommitted == null && latestPoint.heapCommitted != null) {
        metrics.heapCommitted = Number(latestPoint.heapCommitted);
      }
      if (metrics.threadCount == null && latestPoint.threadCount != null) {
        metrics.threadCount = Number(latestPoint.threadCount);
      }
    }
  }

  // ── Handle Observability Metrics API app-level metrics ──
  if (dashStats?._appMetrics) {
    const am = dashStats._appMetrics;
    if (am.inboundRequestCount != null && metrics.inboundRequestCount == null) metrics.inboundRequestCount = Number(am.inboundRequestCount);
    if (am.inboundAvgResponseTime != null && metrics.inboundAvgResponseTime == null) metrics.inboundAvgResponseTime = Number(am.inboundAvgResponseTime);
    if (am.outboundRequestCount != null && metrics.outboundRequestCount == null) metrics.outboundRequestCount = Number(am.outboundRequestCount);
    if (am.outboundAvgResponseTime != null && metrics.outboundAvgResponseTime == null) metrics.outboundAvgResponseTime = Number(am.outboundAvgResponseTime);
    if (am.messageCount != null && metrics.messageCount == null) metrics.messageCount = Number(am.messageCount);
    if (am.errorCount != null && metrics.errorCount == null) metrics.errorCount = Number(am.errorCount);
  }

  // Handle JVM metrics endpoint response
  if (dashStats?._jvmMetrics) {
    const jvm = dashStats._jvmMetrics;
    if (jvm.processCpuLoad != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(jvm.processCpuLoad) * 100;
    if (jvm.systemCpuLoad != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(jvm.systemCpuLoad) * 100;
    if (jvm.cpuUsage != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(jvm.cpuUsage);
    if (jvm.heapUsed != null && metrics.heapUsed == null) metrics.heapUsed = Number(jvm.heapUsed);
    if (jvm.heapMax != null && metrics.heapCommitted == null) metrics.heapCommitted = Number(jvm.heapMax);
    if (jvm.heapCommitted != null && metrics.heapCommitted == null) metrics.heapCommitted = Number(jvm.heapCommitted);
    if (jvm.nonHeapUsed != null && metrics.nonHeapUsed == null) metrics.nonHeapUsed = Number(jvm.nonHeapUsed);
    if (jvm.threadCount != null && metrics.threadCount == null) metrics.threadCount = Number(jvm.threadCount);
    if (jvm.gcCollections != null && metrics.gcCollections == null) metrics.gcCollections = Number(jvm.gcCollections);
    if (jvm.gcTime != null && metrics.gcTime == null) metrics.gcTime = Number(jvm.gcTime);
    if (jvm.classesLoaded != null && metrics.classesLoaded == null) metrics.classesLoaded = Number(jvm.classesLoaded);
    // Derive memory percent from heap
    if (metrics.memoryPercent == null && jvm.heapUsed != null && jvm.heapMax != null && jvm.heapMax > 0) {
      metrics.memoryPercent = Math.round((Number(jvm.heapUsed) / Number(jvm.heapMax)) * 100);
    }
    if (metrics.memoryUsedMB == null && jvm.heapUsed != null) {
      metrics.memoryUsedMB = Number(jvm.heapUsed) / (1024 * 1024);
    }
    if (metrics.memoryTotalMB == null && jvm.heapMax != null) {
      metrics.memoryTotalMB = Number(jvm.heapMax) / (1024 * 1024);
    }
  }

  // Handle monitoring metrics series
  if (dashStats?._metricSeries && Array.isArray(dashStats._metricSeries)) {
    for (const series of dashStats._metricSeries) {
      const name = series?.name ?? series?.metric ?? '';
      const points = series?.datapoints ?? series?.data ?? [];
      if (points.length === 0) continue;
      const lastPoint = points[points.length - 1];
      const value = Array.isArray(lastPoint) ? lastPoint[0] : lastPoint?.value;
      if (value == null) continue;
      if (name.includes('cpu') && metrics.cpuPercent == null) metrics.cpuPercent = Number(value);
      if (name.includes('memory.usage') && metrics.memoryPercent == null) metrics.memoryPercent = Number(value);
      if (name.includes('memory.total') && metrics.memoryTotalMB == null) metrics.memoryTotalMB = Number(value) / (1024 * 1024);
    }
  }

  // Compute memoryPercent from used/total if still null
  if (
    metrics.memoryPercent == null &&
    metrics.memoryUsedMB != null &&
    metrics.memoryTotalMB != null &&
    metrics.memoryTotalMB > 0
  ) {
    metrics.memoryPercent = Math.round((metrics.memoryUsedMB / metrics.memoryTotalMB) * 100);
  }

  return metrics;
}

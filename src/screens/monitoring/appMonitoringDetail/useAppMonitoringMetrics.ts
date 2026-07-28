// ============================================================
// App Monitoring Detail - derived metrics hook
// Normalizes CloudHub / InfluxDB monitoring payloads into the
// values and chart series consumed by the tab components.
// ============================================================

import { useMemo } from 'react';
import { getWorkerInfo } from '../../../utils/appHelpers';
import { extractNumericValue, flattenWorkerStats, parseConfiguredMemoryToMB } from './metricHelpers';

interface UseAppMonitoringMetricsArgs {
  app: any;
  cpuMetrics: any;
  memoryMetrics: any;
  dashStats: any;
}

export function useAppMonitoringMetrics({ app, cpuMetrics, memoryMetrics, dashStats }: UseAppMonitoringMetricsArgs) {
  // Process metrics data into simple number arrays for charts
  const cpuData = useMemo(() => {
    if (!cpuMetrics) return [];
    if (Array.isArray(cpuMetrics)) {
      if (cpuMetrics.length === 0) return [];
      if (cpuMetrics[0]?.value !== undefined) return cpuMetrics.map((p: any) => p.value ?? 0);
      if (cpuMetrics[0]?.data) return cpuMetrics[0].data.map((p: any) => p.value ?? p.y ?? 0);
      if (typeof cpuMetrics[0] === 'number') return cpuMetrics;
    }
    return [];
  }, [cpuMetrics]);

  const memData = useMemo(() => {
    if (!memoryMetrics) return [];
    if (Array.isArray(memoryMetrics)) {
      if (memoryMetrics.length === 0) return [];
      if (memoryMetrics[0]?.value !== undefined) return memoryMetrics.map((p: any) => p.value ?? 0);
      if (memoryMetrics[0]?.data) return memoryMetrics[0].data.map((p: any) => p.value ?? p.y ?? 0);
      if (typeof memoryMetrics[0] === 'number') return memoryMetrics;
    }
    return [];
  }, [memoryMetrics]);

  // Derived values
  const workerInfo = useMemo(() => getWorkerInfo(app), [app]);
  const configuredCpu = (app as any)?.workers?.type?.cpu ? String((app as any).workers.type.cpu) : null;
  const configuredMemory = (app as any)?.workers?.type?.memory ? String((app as any).workers.type.memory) : null;
  const configuredMemoryMB = parseConfiguredMemoryToMB(configuredMemory);

  const workerStats = useMemo(() => {
    const appObj = app as any;
    const statuses = appObj?.workerStatuses ?? appObj?.workers?.statuses ?? [];
    if (statuses.length > 0) {
      const w = statuses[0];
      const raw = w?.statisticsByWorker ?? w?.statistics ?? w ?? {};
      return flattenWorkerStats(raw);
    }
    return appObj?.monitoring ?? {};
  }, [app]);

  const normalizedExtraMetrics = useMemo(() => dashStats?._extraMetrics ?? null, [dashStats]);
  const observabilityMetrics = useMemo(() => dashStats?._appMetrics ?? null, [dashStats]);
  const jvmMetrics = useMemo(() => dashStats?._jvmMetrics ?? null, [dashStats]);

  const rawCpuPercent =
    normalizedExtraMetrics?.cpuPercent
    ?? jvmMetrics?.cpuUsage
    ?? workerStats?.cpuPercentageUsed
    ?? workerStats?.cpu
    ?? workerStats?.cpuUsage
    ?? (cpuData.length > 0 ? cpuData[cpuData.length - 1] : null);
  const cpuPercent = rawCpuPercent != null ? Number(rawCpuPercent) : null;

  const memTotalRaw = Number(
    normalizedExtraMetrics?.memoryTotal
    ?? jvmMetrics?.heapMax
    ?? jvmMetrics?.heapCommitted
    ?? workerStats?.memoryTotalMax
  ) || extractNumericValue(workerStats?.memoryTotalMax);
  const memUsedRaw = Number(
    normalizedExtraMetrics?.memoryUsed
    ?? jvmMetrics?.heapUsed
    ?? workerStats?.memoryTotalUsed
    ?? workerStats?.memoryUsage
  ) || extractNumericValue(workerStats?.memoryTotalUsed) || extractNumericValue(workerStats?.memoryUsage);
  const memTotal = memTotalRaw > 10_000 ? Math.round(memTotalRaw / (1024 * 1024)) : memTotalRaw;
  const memUsage = memUsedRaw > 10_000 ? Math.round(memUsedRaw / (1024 * 1024)) : memUsedRaw;
  const rawMemPercent =
    normalizedExtraMetrics?.memoryPercent
    ?? workerStats?.memoryPercentageUsed
    ?? (memTotal > 0 && memUsage > 0 ? Math.round((memUsage / memTotal) * 100) : null)
    ?? (memData.length > 0 ? memData[memData.length - 1] : null);
  const memPercent = rawMemPercent != null ? Number(rawMemPercent) : null;

  const rawThreadCount =
    normalizedExtraMetrics?.threadCount
    ?? jvmMetrics?.threadCount
    ?? workerStats?.threadCount
    ?? extractNumericValue(workerStats?.threadCount);
  const threadCount = rawThreadCount != null ? Number(rawThreadCount) : null;
  const workerStatuses = (app as any)?.workerStatuses ?? [];
  const numWorkers = workerStatuses.length;

  // ── Extract InfluxDB data ──
  const influxData = useMemo(() => {
    if (!dashStats) return null;
    if (dashStats._timeSeries || dashStats._extraMetrics) {
      return { timeSeries: dashStats._timeSeries ?? [], extraMetrics: dashStats._extraMetrics ?? {} };
    }
    return null;
  }, [dashStats]);

  const messageCount = influxData?.extraMetrics?.messageCount ?? observabilityMetrics?.messageCount ?? null;
  const influxThreadCount = influxData?.extraMetrics?.threadCount ?? jvmMetrics?.threadCount ?? null;
  const influxHeapUsed = influxData?.extraMetrics?.heapUsed ?? jvmMetrics?.heapUsed ?? null;
  const inboundAvgResponseTime = influxData?.extraMetrics?.inboundAvgResponseTime ?? observabilityMetrics?.inboundAvgResponseTime ?? null;
  const inboundRequestCount = influxData?.extraMetrics?.inboundRequestCount ?? observabilityMetrics?.inboundRequestCount ?? null;
  const inboundErrorCount = influxData?.extraMetrics?.inboundErrorCount ?? observabilityMetrics?.errorCount ?? (
    (inboundAvgResponseTime != null || inboundRequestCount != null || messageCount != null) ? 0 : null
  );
  const outboundAvgResponseTime = influxData?.extraMetrics?.outboundAvgResponseTime ?? observabilityMetrics?.outboundAvgResponseTime ?? null;
  const outboundRequestCount = influxData?.extraMetrics?.outboundRequestCount ?? observabilityMetrics?.outboundRequestCount ?? null;
  const outboundErrorCount = influxData?.extraMetrics?.outboundErrorCount ?? (
    (outboundAvgResponseTime != null || outboundRequestCount != null) ? 0 : null
  );
  const hasOutboundData = outboundAvgResponseTime != null || outboundRequestCount != null || outboundErrorCount != null;
  const hasInboundHttpData = inboundAvgResponseTime != null || inboundRequestCount != null || inboundErrorCount != null;

  const influxCpu = useMemo(() => {
    if (!influxData?.timeSeries) return null;
    const cpuPts = influxData.timeSeries.filter((p: any) => p.cpu != null);
    return cpuPts.length > 0 ? cpuPts[cpuPts.length - 1].cpu : null;
  }, [influxData]);

  const influxMem = useMemo(() => {
    if (!influxData?.timeSeries) return null;
    const memPts = influxData.timeSeries.filter((p: any) => p.memory != null);
    return memPts.length > 0 ? memPts[memPts.length - 1].memory : null;
  }, [influxData]);

  // ── Chart series ──
  const inboundRequestSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.inboundRequests != null || p.inbound_request_count != null)
      .map((p: any) => p.inboundRequests ?? p.inbound_request_count ?? 0);
  }, [influxData]);

  const inboundResponseTimeSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.inboundResponseTime != null || p.inbound_avg_response_time != null)
      .map((p: any) => p.inboundResponseTime ?? p.inbound_avg_response_time ?? 0);
  }, [influxData]);

  const outboundRequestSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.outboundRequests != null || p.outbound_request_count != null)
      .map((p: any) => p.outboundRequests ?? p.outbound_request_count ?? 0);
  }, [influxData]);

  const outboundResponseTimeSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.outboundResponseTime != null || p.outbound_avg_response_time != null)
      .map((p: any) => p.outboundResponseTime ?? p.outbound_avg_response_time ?? 0);
  }, [influxData]);

  const jvmCpuSeries = useMemo(() => {
    if (cpuData.length > 0) return cpuData;
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries.filter((p: any) => p.cpu != null).map((p: any) => p.cpu ?? 0);
  }, [cpuData, influxData]);

  const jvmHeapSeries = useMemo(() => {
    if (memData.length > 0) return memData;
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.memory != null || p.heapUsed != null)
      .map((p: any) => {
        const val = p.memory ?? p.heapUsed ?? 0;
        return val > 10_000 ? val / (1024 * 1024) : val;
      });
  }, [memData, influxData]);

  const jvmThreadSeries = useMemo(() => {
    if (!influxData?.timeSeries) return threadCount != null ? [threadCount] : [];
    return influxData.timeSeries
      .filter((p: any) => p.threadCount != null || p.threads != null)
      .map((p: any) => p.threadCount ?? p.threads ?? 0);
  }, [influxData, threadCount]);

  // Detect real metrics availability
  const hasRealCpu = cpuPercent != null || cpuData.length > 0 || influxCpu != null;
  const hasRealMem = memPercent != null || normalizedExtraMetrics?.memoryUsed != null || jvmMetrics?.heapUsed != null || workerStats?.memoryTotalUsed != null || workerStats?.memoryUsage != null || memData.length > 0 || influxMem != null;
  const hasRealThreads = normalizedExtraMetrics?.threadCount != null || workerStats?.threadCount != null || influxThreadCount != null;
  const hasInfluxData = messageCount != null || influxCpu != null || influxMem != null || influxThreadCount != null;
  const hasAnyMetrics = hasRealCpu || hasRealMem || hasRealThreads || hasInfluxData;
  const hasConfiguredSystemData = !hasRealCpu && !hasRealMem && (configuredCpu != null || configuredMemory != null);
  // JVM extra metrics
  const jvmGcCollections = influxData?.extraMetrics?.gcCollections ?? jvmMetrics?.gcCollections ?? null;
  const jvmGcTime = influxData?.extraMetrics?.gcTime ?? jvmMetrics?.gcTime ?? null;
  const jvmClassesLoaded = influxData?.extraMetrics?.classesLoaded ?? jvmMetrics?.classesLoaded ?? null;
  const jvmHeapCommitted = influxData?.extraMetrics?.heapCommitted ?? jvmMetrics?.heapCommitted ?? jvmMetrics?.heapMax ?? null;
  const jvmNonHeapUsed = influxData?.extraMetrics?.nonHeapUsed ?? jvmMetrics?.nonHeapUsed ?? null;

  return {
    cpuData,
    memData,
    workerInfo,
    configuredCpu,
    configuredMemory,
    configuredMemoryMB,
    cpuPercent,
    memTotalRaw,
    memUsedRaw,
    memTotal,
    memUsage,
    memPercent,
    threadCount,
    workerStatuses,
    numWorkers,
    messageCount,
    influxThreadCount,
    influxHeapUsed,
    inboundAvgResponseTime,
    inboundRequestCount,
    inboundErrorCount,
    outboundAvgResponseTime,
    outboundRequestCount,
    outboundErrorCount,
    hasOutboundData,
    hasInboundHttpData,
    influxCpu,
    influxMem,
    inboundRequestSeries,
    inboundResponseTimeSeries,
    outboundRequestSeries,
    outboundResponseTimeSeries,
    jvmCpuSeries,
    jvmHeapSeries,
    jvmThreadSeries,
    hasRealCpu,
    hasRealMem,
    hasRealThreads,
    hasAnyMetrics,
    hasConfiguredSystemData,
    jvmGcCollections,
    jvmGcTime,
    jvmClassesLoaded,
    jvmHeapCommitted,
    jvmNonHeapUsed,
  };
}

export type AppMonitoringMetrics = ReturnType<typeof useAppMonitoringMetrics>;

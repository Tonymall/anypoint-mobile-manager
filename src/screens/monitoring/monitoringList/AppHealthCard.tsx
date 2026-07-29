// ═══════════════════════════════════════════════════════════════════
// Monitoring — application health card
// ═══════════════════════════════════════════════════════════════════
// Leads with identity and status, then the handful of facts that
// actually change a decision as compact metadata chips — the pattern
// ApplicationsListScreen already uses.
//
// The full key/value configuration table this card used to embed
// (worker type, workers, runtime, region, heap, GC, request counts…)
// lives on the detail screen the card already navigates to; a row here
// is a scannable summary, not a spec sheet.
// ═══════════════════════════════════════════════════════════════════

import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { Skeleton } from '../../../components/ui';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  type StatusRole,
  type Tokens,
} from '../../../theme';
import { getAppName, getMuleVersion, getWorkerInfo } from '../../../utils/appHelpers';
import { getStatusRole, getStatusLabel, formatRelativeTime, formatMB } from '../../../utils/statusHelpers';
import type { IconName } from '../../../types/icons';
import type { MonitoringMetrics } from './metrics';

// ── Metadata chip ───────────────────────────────────────────────────

const MetaChip = memo(function MetaChip({
  icon,
  label,
  t,
}: {
  icon: IconName;
  label: string;
  t: Tokens;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: t.color.surface.sunken }]}>
      <Icon name={icon} size={11} color={t.color.text.secondary} />
      <Text style={[styles.chipText, { color: t.color.text.secondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

// ── Utilisation bar ─────────────────────────────────────────────────

/** Utilisation reads as a status: comfortable, warm, or hot. */
function loadRole(t: Tokens, percent: number, cool: StatusRole): StatusRole {
  if (percent > 80) return t.color.status.danger;
  if (percent > 60) return t.color.status.warning;
  return cool;
}

const UtilisationBar = memo(function UtilisationBar({
  label,
  percent,
  role,
  t,
}: {
  label: string;
  percent: number;
  role: StatusRole;
  t: Tokens;
}) {
  return (
    <View style={styles.meter}>
      <View style={styles.meterLabelRow}>
        <Text style={[typeScale.caption, { color: t.color.text.tertiary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[typeScale.caption, { color: role.base }]}>{Math.round(percent)}%</Text>
      </View>
      <ProgressBar
        progress={Math.min(percent / 100, 1)}
        color={role.base}
        style={[styles.meterTrack, { backgroundColor: t.color.surface.sunken }]}
      />
    </View>
  );
});

// ── Card ────────────────────────────────────────────────────────────

export interface AppHealthCardProps {
  app: any;
  metrics: MonitoringMetrics;
  detailLoading: boolean;
  onPress: () => void;
}

export const AppHealthCard = memo(function AppHealthCard({
  app,
  metrics,
  detailLoading,
  onPress,
}: AppHealthCardProps) {
  const t = useTokens();

  const status = app?.status ?? 'UNKNOWN';
  const role = getStatusRole(t, status);
  const statusLabel = getStatusLabel(status);
  const appName = getAppName(app);
  const muleVer = getMuleVersion(app);
  const workerInfo = getWorkerInfo(app);
  const region = app?.region ?? '';
  const lastUpdated = app?.lastUpdateTime;
  const subtitle = app?.fullDomain ?? app?.domain ?? '';

  const hasMetrics = metrics.cpuPercent != null || metrics.memoryPercent != null;
  const hasTraffic =
    metrics.inboundRequestCount != null ||
    metrics.messageCount != null ||
    metrics.inboundAvgResponseTime != null;
  const isRunning = status === 'STARTED';
  const settled = isRunning && !detailLoading;

  // CloudHub 2 states its allocation as CPU/memory limits rather than a
  // named worker size — show whichever the deployment actually has.
  const ch2Cpu = app?.deploymentTarget === 'cloudhub2' ? app?.workers?.type?.cpu : null;
  const ch2Memory = app?.deploymentTarget === 'cloudhub2' ? app?.workers?.type?.memory : null;

  // The honest caveats, as one quiet footnote rather than a banner on
  // every card. Meaning preserved, weight removed.
  const caveats: string[] = [];
  if (settled && !hasMetrics) {
    // Deliberately not pushed per card: with no Monitoring subscription this
    // is true of every application, so repeating it on each row is noise. The
    // screen states it once above the list instead.
  }
  if (settled && !hasTraffic) {
    caveats.push('No traffic metrics exposed by this control plane');
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${appName}, ${statusLabel}`}
      accessibilityHint="Double tap to view monitoring detail"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.color.surface.raised,
          borderColor: t.color.border.subtle,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={[styles.cardAccent, { backgroundColor: role.base }]} />

      <View style={styles.cardBody}>
        {/* Identity + status */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[typeScale.subheading, { color: t.color.text.primary }]} numberOfLines={1}>
              {appName}
            </Text>
            {subtitle ? (
              <Text
                style={[typeScale.caption, styles.subtitle, { color: t.color.text.tertiary }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={[styles.statusBadge, { backgroundColor: role.surface }]}>
            <View style={[styles.statusDot, { backgroundColor: role.base }]} />
            <Text style={[styles.statusText, { color: role.base }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* The facts that matter, inline */}
        <View style={styles.chipRow}>
          {ch2Cpu ? <MetaChip icon="chip" label={`${ch2Cpu} vCore`} t={t} /> : null}
          {ch2Memory ? <MetaChip icon="memory" label={String(ch2Memory)} t={t} /> : null}
          {!ch2Cpu && workerInfo.typeName ? (
            <MetaChip
              icon="server"
              label={`${workerInfo.amount}x ${workerInfo.typeName}`}
              t={t}
            />
          ) : null}
          {ch2Cpu ? (
            <MetaChip icon="server" label={`${workerInfo.amount} replicas`} t={t} />
          ) : null}
          {muleVer ? <MetaChip icon="puzzle" label={`Mule ${muleVer}`} t={t} /> : null}
          {region ? <MetaChip icon="map-marker-outline" label={region} t={t} /> : null}
          {metrics.threadCount != null ? (
            <MetaChip icon="sitemap-outline" label={`${metrics.threadCount} threads`} t={t} />
          ) : null}
          {metrics.inboundRequestCount != null ? (
            <MetaChip
              icon="chart-timeline-variant"
              label={`${metrics.inboundRequestCount.toLocaleString()} req`}
              t={t}
            />
          ) : null}
          {metrics.inboundAvgResponseTime != null ? (
            <MetaChip
              icon="timer-outline"
              label={`${Math.round(metrics.inboundAvgResponseTime)} ms`}
              t={t}
            />
          ) : null}
          {metrics.errorCount != null && metrics.errorCount > 0 ? (
            <MetaChip
              icon="alert-circle-outline"
              label={`${metrics.errorCount.toLocaleString()} errors`}
              t={t}
            />
          ) : null}
          {lastUpdated ? (
            <MetaChip icon="clock-outline" label={formatRelativeTime(lastUpdated)} t={t} />
          ) : null}
        </View>

        {/* Live utilisation, when the platform actually reports it */}
        {hasMetrics ? (
          <View style={[styles.meters, { borderTopColor: t.color.border.subtle }]}>
            {metrics.cpuPercent != null ? (
              <UtilisationBar
                label="CPU"
                percent={metrics.cpuPercent}
                role={loadRole(t, metrics.cpuPercent, t.color.status.info)}
                t={t}
              />
            ) : null}
            {metrics.memoryPercent != null ? (
              <UtilisationBar
                label={
                  metrics.memoryUsedMB != null && metrics.memoryTotalMB != null
                    ? `Memory · ${formatMB(metrics.memoryUsedMB)}/${formatMB(metrics.memoryTotalMB)} MB`
                    : 'Memory'
                }
                percent={metrics.memoryPercent}
                role={loadRole(t, metrics.memoryPercent, t.color.status.success)}
                t={t}
              />
            ) : null}
          </View>
        ) : detailLoading && isRunning ? (
          <View style={[styles.meters, { borderTopColor: t.color.border.subtle }]}>
            <View style={styles.meter}>
              <View style={styles.meterLabelRow}>
                <Skeleton width="22%" height={11} />
                <Skeleton width="12%" height={11} />
              </View>
              <Skeleton height={4} radius={2} />
            </View>
            <View style={styles.meter}>
              <View style={styles.meterLabelRow}>
                <Skeleton width="38%" height={11} />
                <Skeleton width="12%" height={11} />
              </View>
              <Skeleton height={4} radius={2} />
            </View>
          </View>
        ) : null}

        {/* Quiet, honest footnote */}
        {caveats.length > 0 ? (
          <View style={styles.note}>
            <Icon name="information-outline" size={12} color={t.color.text.tertiary} />
            <Text style={[typeScale.caption, styles.noteText, { color: t.color.text.tertiary }]}>
              {caveats.join(' · ')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: spacing.md,
    bottom: spacing.md,
    width: 3,
    borderRadius: 1.5,
  },
  cardBody: {
    padding: spacing.lg,
    paddingLeft: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
  },
  statusText: { ...typeScale.caption, fontWeight: '700' },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    maxWidth: '100%',
  },
  chipText: { ...typeScale.caption, fontWeight: '500', flexShrink: 1 },
  meters: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  meter: {
    gap: spacing.xs,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  meterTrack: {
    height: 4,
    borderRadius: 2,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: spacing.sm,
  },
  noteText: {
    flex: 1,
    fontWeight: '500',
  },
});

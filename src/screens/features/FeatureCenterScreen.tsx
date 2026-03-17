import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useApplications, useAuditLogs, useEnvironments, useManagedAPIs } from '../../hooks/queries';
import { useAuthStore } from '../../stores/authStore';
import * as apiManagerService from '../../services/apiManagerService';
import * as governanceService from '../../services/governanceService';
import * as runtimeService from '../../services/runtimeService';
import { anypointColors } from '../../theme';
import { getAppName, getDeploymentTarget, getWorkerInfo } from '../../utils/appHelpers';
import type { Application } from '../../types';

type CompareSummary = {
  applications: number;
  running: number;
  failed: number;
  apis: number;
};

function buildCompareSummary(applications: Application[], apis: any[]): CompareSummary {
  return {
    applications: applications.length,
    running: applications.filter((app) => app.status === 'STARTED').length,
    failed: applications.filter((app) => app.status === 'FAILED' || app.status === 'DEPLOY_FAILED').length,
    apis: apis.length,
  };
}

function formatRelativeTime(raw?: string): string {
  if (!raw) return 'Unknown time';
  const timestamp = new Date(raw).getTime();
  if (Number.isNaN(timestamp)) return raw;

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.round(diffHours / 24)}d ago`;
}

const SectionHeader: React.FC<{ title: string; accent: string; subtitle?: string }> = ({ title, accent, subtitle }) => {
  const theme = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const FeatureCard: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  onPress?: () => void;
}> = ({ icon, title, subtitle, color, onPress }) => {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.featureCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: color + '22',
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      <View style={[styles.featureAccent, { backgroundColor: color }]} />
      <View style={styles.featureInner}>
        <View style={[styles.featureIconWrap, { backgroundColor: color + '14' }]}>
          <Icon name={icon} size={20} color={color} />
        </View>
        <View style={styles.featureTextWrap}>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {title}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {subtitle}
          </Text>
        </View>
        <Icon name={onPress ? 'arrow-right' : 'check-circle'} size={18} color={onPress ? color : anypointColors.success} />
      </View>
    </Pressable>
  );
};

const InsightCard: React.FC<{ title: string; body: string; icon: string; color: string }> = ({
  title,
  body,
  icon,
  color,
}) => {
  const theme = useTheme();

  return (
    <View style={[styles.insightCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
      <View style={[styles.insightIcon, { backgroundColor: color + '16' }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {title}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, lineHeight: 18 }}>
          {body}
        </Text>
      </View>
    </View>
  );
};

const CompareRow: React.FC<{ label: string; leftValue: string | number; rightValue: string | number }> = ({
  label,
  leftValue,
  rightValue,
}) => {
  const theme = useTheme();

  return (
    <View style={[styles.compareRow, { borderTopColor: theme.colors.outlineVariant }]}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, width: 120 }}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1, textAlign: 'center', fontWeight: '600' }}>
        {leftValue}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1, textAlign: 'center', fontWeight: '600' }}>
        {rightValue}
      </Text>
    </View>
  );
};

const FeatureCenterScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);

  const { data: applications = [] } = useApplications();
  const { data: apis = [] } = useManagedAPIs();
  const { data: environments = [] } = useEnvironments(currentOrg?.id);
  const { data: auditLogs, isLoading: auditLoading } = useAuditLogs({
    platforms: ['Anypoint MQ', 'Object Store'],
    limit: 12,
  });

  const [baselineEnvId, setBaselineEnvId] = useState<string | null>(currentEnv?.id ?? null);
  const [targetEnvId, setTargetEnvId] = useState<string | null>(null);
  const effectiveBaselineEnvId = baselineEnvId ?? currentEnv?.id ?? environments[0]?.id ?? null;
  const effectiveTargetEnvId = targetEnvId
    ?? environments.find((environment) => environment.id !== effectiveBaselineEnvId)?.id
    ?? environments[0]?.id
    ?? null;

  const baselineEnv = environments.find((environment) => environment.id === effectiveBaselineEnvId) ?? null;
  const targetEnv = environments.find((environment) => environment.id === effectiveTargetEnvId) ?? null;

  const { data: governanceProfiles } = useQuery({
    queryKey: ['feature-center', 'governance-profiles', currentOrg?.id],
    queryFn: () => governanceService.getProfiles(currentOrg!.id, { limit: 10 }),
    enabled: !!currentOrg?.id,
  });

  const { data: governanceRulesets } = useQuery({
    queryKey: ['feature-center', 'governance-rulesets', currentOrg?.id],
    queryFn: () => governanceService.getRulesets(currentOrg!.id, { limit: 10 }),
    enabled: !!currentOrg?.id,
  });

  const { data: governanceReports } = useQuery({
    queryKey: ['feature-center', 'governance-reports', currentOrg?.id],
    queryFn: () => governanceService.getConformanceReports(currentOrg!.id, { limit: 10 }),
    enabled: !!currentOrg?.id,
  });

  const { data: baselineApps = [], isLoading: baselineAppsLoading } = useQuery({
    queryKey: ['feature-center', 'baseline-apps', currentOrg?.id, effectiveBaselineEnvId],
    queryFn: () => runtimeService.getApplicationsForEnvironment(currentOrg!.id, effectiveBaselineEnvId!),
    enabled: !!currentOrg?.id && !!effectiveBaselineEnvId,
  });

  const { data: targetApps = [], isLoading: targetAppsLoading } = useQuery({
    queryKey: ['feature-center', 'target-apps', currentOrg?.id, effectiveTargetEnvId],
    queryFn: () => runtimeService.getApplicationsForEnvironment(currentOrg!.id, effectiveTargetEnvId!),
    enabled: !!currentOrg?.id && !!effectiveTargetEnvId,
  });

  const { data: baselineApis = [], isLoading: baselineApisLoading } = useQuery({
    queryKey: ['feature-center', 'baseline-apis', currentOrg?.id, effectiveBaselineEnvId],
    queryFn: () => apiManagerService.getManagedAPIs(currentOrg!.id, effectiveBaselineEnvId!),
    enabled: !!currentOrg?.id && !!effectiveBaselineEnvId,
  });

  const { data: targetApis = [], isLoading: targetApisLoading } = useQuery({
    queryKey: ['feature-center', 'target-apis', currentOrg?.id, effectiveTargetEnvId],
    queryFn: () => apiManagerService.getManagedAPIs(currentOrg!.id, effectiveTargetEnvId!),
    enabled: !!currentOrg?.id && !!effectiveTargetEnvId,
  });

  const compareLoading = baselineAppsLoading || targetAppsLoading || baselineApisLoading || targetApisLoading;
  const baselineSummary = useMemo(() => buildCompareSummary(baselineApps, baselineApis), [baselineApps, baselineApis]);
  const targetSummary = useMemo(() => buildCompareSummary(targetApps, targetApis), [targetApps, targetApis]);
  const conformanceReports = governanceReports?.data ?? [];
  const nonConformantReports = useMemo(
    () => conformanceReports.filter((report) => report.status === 'non-conformant'),
    [conformanceReports],
  );
  const auditEntries = auditLogs?.data ?? [];
  const firstAppDomain = applications[0]?.domain;

  const topologyGroups = useMemo(() => {
    const grouped = new Map<string, Application[]>();

    for (const application of applications) {
      const target = getDeploymentTarget(application) || 'Runtime';
      const current = grouped.get(target) ?? [];
      current.push(application);
      grouped.set(target, current);
    }

    return Array.from(grouped.entries()).sort((left, right) => right[1].length - left[1].length);
  }, [applications]);

  const insights = useMemo(() => {
    const items: Array<{ title: string; body: string; icon: string; color: string }> = [];
    const failedApps = applications.filter((app) => app.status === 'FAILED' || app.status === 'DEPLOY_FAILED');
    const stoppedApps = applications.filter((app) => app.status === 'STOPPED');
    const ch2Apps = applications.filter((app) => app.deploymentTarget === 'cloudhub2');

    if (failedApps.length > 0) {
      items.push({
        title: `${failedApps.length} application${failedApps.length === 1 ? '' : 's'} need attention`,
        body: `${failedApps.slice(0, 3).map((app) => getAppName(app)).join(', ')} ${failedApps.length > 3 ? 'and more are currently failing.' : 'are currently failing.'}`,
        icon: 'alert-circle-outline',
        color: anypointColors.error,
      });
    }

    if (nonConformantReports.length > 0) {
      items.push({
        title: `${nonConformantReports.length} governance issue${nonConformantReports.length === 1 ? '' : 's'} detected`,
        body: `Recent non-conformant APIs: ${nonConformantReports.slice(0, 2).map((report) => report.apiName).join(', ')}.`,
        icon: 'shield-alert-outline',
        color: anypointColors.warning,
      });
    }

    if (stoppedApps.length > 0) {
      items.push({
        title: `${stoppedApps.length} application${stoppedApps.length === 1 ? '' : 's'} are idle`,
        body: 'Use the command center to confirm whether these should remain stopped or come back online.',
        icon: 'pause-circle-outline',
        color: anypointColors.secondary,
      });
    }

    if (ch2Apps.length > 0) {
      items.push({
        title: `${ch2Apps.length} CloudHub 2.0 deployment${ch2Apps.length === 1 ? '' : 's'} active`,
        body: 'Topology now surfaces CloudHub 2.0 separately so teams can spot target layout at a glance.',
        icon: 'layers-triple-outline',
        color: anypointColors.info,
      });
    }

    if (items.length === 0) {
      items.push({
        title: 'Platform looks healthy',
        body: 'No failed apps or governance warnings are standing out right now. This is a good time to compare environments and review topology.',
        icon: 'check-decagram-outline',
        color: anypointColors.success,
      });
    }

    return items;
  }, [applications, nonConformantReports]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={[styles.heroBadge, { backgroundColor: anypointColors.success + '14' }]}>
          <Icon name="check-decagram" size={14} color={anypointColors.success} />
          <Text variant="labelMedium" style={{ color: anypointColors.success, fontWeight: '700' }}>
            Free in test
          </Text>
        </View>
        <Text variant="headlineMedium" style={{ color: theme.colors.onSurface, fontWeight: '800' }}>
          MuleOps Feature Center
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, lineHeight: 22 }}>
          Explore the operations capabilities already in MuleOps, plus new comparison,
          governance, topology, and platform activity views now grouped in one place for test.
        </Text>
        <View style={styles.heroStats}>
          <View style={[styles.heroStatChip, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
              {applications.length} apps
            </Text>
          </View>
          <View style={[styles.heroStatChip, { backgroundColor: anypointColors.secondary + '12' }]}>
            <Text variant="labelMedium" style={{ color: anypointColors.secondary }}>
              {apis.length} APIs
            </Text>
          </View>
          <View style={[styles.heroStatChip, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text variant="labelMedium" style={{ color: anypointColors.warning }}>
              {environments.length} envs
            </Text>
          </View>
        </View>
      </View>

      <SectionHeader
        title="Feature Access"
        subtitle="Everything here is available without subscriptions."
        accent={theme.colors.primary}
      />
      <View style={styles.featureGrid}>
        <FeatureCard
          icon="play-circle-outline"
          title="Real-Time Log Streaming"
          subtitle="Open live logs with the runtime log feed already in the app."
          color={anypointColors.primary}
          onPress={() =>
            firstAppDomain
              ? router.push({ pathname: '/(main)/runtime/logs' as any, params: { domain: firstAppDomain } })
              : router.push('/(main)/runtime' as any)
          }
        />
        <FeatureCard
          icon="tune-vertical-variant"
          title="Application Command Center"
          subtitle="Start, stop, restart, and inspect live applications."
          color={anypointColors.secondary}
          onPress={() => router.push('/(main)/runtime' as any)}
        />
        <FeatureCard
          icon="chart-line"
          title="Performance Metrics"
          subtitle="CPU, memory, request telemetry, and monitoring dashboards."
          color={anypointColors.accent}
          onPress={() => router.push('/(main)/monitoring' as any)}
        />
        <FeatureCard
          icon="shield-check-outline"
          title="API Governance"
          subtitle="Profiles, rulesets, and conformance summaries."
          color={anypointColors.mulePurple}
        />
        <FeatureCard
          icon="source-branch"
          title="Environment Comparison"
          subtitle="Compare runtime and API surface across environments."
          color={anypointColors.info}
        />
        <FeatureCard
          icon="graph-outline"
          title="Application Topology"
          subtitle="Visualize runtime layout by deployment target."
          color={anypointColors.warning}
        />
        <FeatureCard
          icon="lightbulb-on-outline"
          title="Operational Insights"
          subtitle="Quick summaries driven by current platform state."
          color={anypointColors.success}
        />
        <FeatureCard
          icon="database-outline"
          title="AnypointMQ & Object Store Activity"
          subtitle="Recent MQ and Object Store events from audit activity."
          color={theme.colors.primary}
        />
      </View>

      <SectionHeader
        title="Operational Insights"
        subtitle="Quick signals built from the data already available in your account."
        accent={anypointColors.success}
      />
      {insights.map((insight) => (
        <InsightCard
          key={insight.title}
          title={insight.title}
          body={insight.body}
          icon={insight.icon}
          color={insight.color}
        />
      ))}

      <SectionHeader
        title="Environment Comparison"
        subtitle="Spot drift between two environments without switching the active session."
        accent={anypointColors.info}
      />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <View style={styles.selectorRow}>
          <View style={styles.selectorColumn}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Baseline
            </Text>
            {environments.map((environment) => {
              const selected = environment.id === effectiveBaselineEnvId;
              return (
                <Pressable
                  key={`baseline-${environment.id}`}
                  onPress={() => setBaselineEnvId(environment.id)}
                  style={[
                    styles.optionChip,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
                      backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.surface,
                    },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={{ color: selected ? theme.colors.primary : theme.colors.onSurface }}
                  >
                    {environment.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.selectorColumn}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Compare to
            </Text>
            {environments.map((environment) => {
              const selected = environment.id === effectiveTargetEnvId;
              return (
                <Pressable
                  key={`target-${environment.id}`}
                  onPress={() => setTargetEnvId(environment.id)}
                  style={[
                    styles.optionChip,
                    {
                      borderColor: selected ? anypointColors.secondary : theme.colors.outlineVariant,
                      backgroundColor: selected ? anypointColors.secondary + '12' : theme.colors.surface,
                    },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={{ color: selected ? anypointColors.secondary : theme.colors.onSurface }}
                  >
                    {environment.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.compareHeaderRow}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
            Metric
          </Text>
          <Text variant="labelMedium" style={{ color: theme.colors.primary, flex: 1, textAlign: 'center' }}>
            {baselineEnv?.name ?? 'Baseline'}
          </Text>
          <Text variant="labelMedium" style={{ color: anypointColors.secondary, flex: 1, textAlign: 'center' }}>
            {targetEnv?.name ?? 'Compare'}
          </Text>
        </View>

        {compareLoading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Loading comparison data...
            </Text>
          </View>
        ) : (
          <>
            <CompareRow label="Applications" leftValue={baselineSummary.applications} rightValue={targetSummary.applications} />
            <CompareRow label="Running" leftValue={baselineSummary.running} rightValue={targetSummary.running} />
            <CompareRow label="Failed" leftValue={baselineSummary.failed} rightValue={targetSummary.failed} />
            <CompareRow label="Managed APIs" leftValue={baselineSummary.apis} rightValue={targetSummary.apis} />
          </>
        )}
      </View>

      <SectionHeader
        title="API Governance"
        subtitle="Live counts from governance profiles, rulesets, and conformance."
        accent={anypointColors.mulePurple}
      />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <View style={styles.governanceGrid}>
          <View style={[styles.governanceStat, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text variant="headlineSmall" style={{ color: theme.colors.primary, fontWeight: '800' }}>
              {governanceProfiles?.data?.length ?? 0}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Profiles
            </Text>
          </View>
          <View style={[styles.governanceStat, { backgroundColor: anypointColors.mulePurple + '12' }]}>
            <Text variant="headlineSmall" style={{ color: anypointColors.mulePurple, fontWeight: '800' }}>
              {governanceRulesets?.data?.length ?? 0}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Rulesets
            </Text>
          </View>
          <View style={[styles.governanceStat, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text variant="headlineSmall" style={{ color: anypointColors.warning, fontWeight: '800' }}>
              {nonConformantReports.length}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Non-conformant
            </Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          {(conformanceReports.length > 0 ? conformanceReports.slice(0, 5) : []).map((report) => {
            const color = report.status === 'conformant'
              ? anypointColors.success
              : report.status === 'non-conformant'
                ? anypointColors.warning
                : theme.colors.onSurfaceVariant;

            return (
              <View
                key={`${report.apiId}-${report.profileId}`}
                style={[styles.governancePill, { backgroundColor: color + '12' }]}
              >
                <Icon
                  name={report.status === 'conformant' ? 'check-circle-outline' : 'shield-alert-outline'}
                  size={16}
                  color={color}
                />
                <Text variant="bodySmall" style={{ color, fontWeight: '600', flex: 1 }}>
                  {report.apiName}
                </Text>
                <Text variant="labelSmall" style={{ color }}>
                  {report.status}
                </Text>
              </View>
            );
          })}

          {conformanceReports.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              No conformance reports returned for this organization yet.
            </Text>
          ) : null}
        </View>
      </View>

      <SectionHeader
        title="Application Topology"
        subtitle="Grouped by deployment target so you can spot runtime layout quickly."
        accent={anypointColors.warning}
      />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        {topologyGroups.map(([target, targetApplications]) => (
          <View
            key={target}
            style={[styles.topologyLane, { backgroundColor: theme.colors.surfaceVariant }]}
          >
            <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
              {target}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, marginBottom: 6 }}>
              {targetApplications.length} application{targetApplications.length === 1 ? '' : 's'}
            </Text>

            {targetApplications.slice(0, 5).map((application) => {
              const workerInfo = getWorkerInfo(application);
              const statusColor = application.status === 'STARTED'
                ? anypointColors.success
                : application.status === 'FAILED' || application.status === 'DEPLOY_FAILED'
                  ? anypointColors.error
                  : anypointColors.warning;

              return (
                <Pressable
                  key={application.id || application.domain}
                  onPress={() =>
                    router.push({ pathname: '/(main)/runtime/[domain]' as any, params: { domain: application.domain } })
                  }
                  style={[styles.topologyNode, { borderTopColor: theme.colors.outlineVariant }]}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                      {getAppName(application)}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                      {workerInfo.amount}x {workerInfo.typeName}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusColor + '14' }]}>
                    <Text variant="labelSmall" style={{ color: statusColor }}>
                      {application.status}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <SectionHeader
        title="MQ & Object Store Activity"
        subtitle="Recent audit activity touching Anypoint MQ and Object Store."
        accent={theme.colors.primary}
      />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        {auditLoading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Loading platform activity...
            </Text>
          </View>
        ) : null}

        {!auditLoading && auditEntries.length === 0 ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            No recent MQ or Object Store audit activity was returned for this organization.
          </Text>
        ) : null}

        {auditEntries.map((entry) => (
          <View
            key={entry.id}
            style={[styles.activityRow, { borderTopColor: theme.colors.outlineVariant }]}
          >
            <View style={[styles.activityIcon, { backgroundColor: theme.colors.primary + '12' }]}>
              <Icon name="database-outline" size={16} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                {entry.action} {entry.objectType || 'resource'}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {entry.objectId || 'Unknown object'} {entry.userName ? `- ${entry.userName}` : ''}
              </Text>
            </View>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatRelativeTime(entry.timestamp)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  heroCard: {
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  heroStatChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 26,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionAccent: {
    width: 3,
    height: 15,
    borderRadius: 2,
  },
  featureGrid: {
    gap: 12,
  },
  featureCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  featureAccent: {
    height: 3,
  },
  featureInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTextWrap: {
    flex: 1,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  selectorColumn: {
    flex: 1,
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  compareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  governanceGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  governanceStat: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
  },
  governancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  topologyLane: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  topologyNode: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FeatureCenterScreen;

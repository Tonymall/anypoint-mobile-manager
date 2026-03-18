import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, ActivityIndicator, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { useEnvironments } from '../../hooks/queries';
import { useAuthStore } from '../../stores/authStore';
import * as apiManagerService from '../../services/apiManagerService';
import * as runtimeService from '../../services/runtimeService';
import { anypointColors } from '../../theme';
import { getAppName } from '../../utils/appHelpers';

type CompareSummary = {
  applications: number;
  running: number;
  failed: number;
  apis: number;
};

function summarize(applications: any[], apis: any[]): CompareSummary {
  return {
    applications: applications.length,
    running: applications.filter((app) => app.status === 'STARTED').length,
    failed: applications.filter((app) => app.status === 'FAILED' || app.status === 'DEPLOY_FAILED').length,
    apis: apis.length,
  };
}

const EnvironmentComparisonScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const { data: environments = [] } = useEnvironments(currentOrg?.id);

  const [baselineEnvId, setBaselineEnvId] = useState<string | null>(currentEnv?.id ?? null);
  const [targetEnvId, setTargetEnvId] = useState<string | null>(null);

  const effectiveBaselineEnvId = baselineEnvId ?? currentEnv?.id ?? environments[0]?.id ?? null;
  const effectiveTargetEnvId = targetEnvId
    ?? environments.find((environment) => environment.id !== effectiveBaselineEnvId)?.id
    ?? environments[0]?.id
    ?? null;

  const baselineEnv = environments.find((environment) => environment.id === effectiveBaselineEnvId) ?? null;
  const targetEnv = environments.find((environment) => environment.id === effectiveTargetEnvId) ?? null;

  const { data: baselineApps = [], isLoading: baselineAppsLoading } = useQuery({
    queryKey: ['environment-comparison', 'baseline-apps', currentOrg?.id, effectiveBaselineEnvId],
    queryFn: () => runtimeService.getApplicationsForEnvironment(currentOrg!.id, effectiveBaselineEnvId!),
    enabled: !!currentOrg?.id && !!effectiveBaselineEnvId,
  });

  const { data: targetApps = [], isLoading: targetAppsLoading } = useQuery({
    queryKey: ['environment-comparison', 'target-apps', currentOrg?.id, effectiveTargetEnvId],
    queryFn: () => runtimeService.getApplicationsForEnvironment(currentOrg!.id, effectiveTargetEnvId!),
    enabled: !!currentOrg?.id && !!effectiveTargetEnvId,
  });

  const { data: baselineApis = [], isLoading: baselineApisLoading } = useQuery({
    queryKey: ['environment-comparison', 'baseline-apis', currentOrg?.id, effectiveBaselineEnvId],
    queryFn: () => apiManagerService.getManagedAPIs(currentOrg!.id, effectiveBaselineEnvId!),
    enabled: !!currentOrg?.id && !!effectiveBaselineEnvId,
  });

  const { data: targetApis = [], isLoading: targetApisLoading } = useQuery({
    queryKey: ['environment-comparison', 'target-apis', currentOrg?.id, effectiveTargetEnvId],
    queryFn: () => apiManagerService.getManagedAPIs(currentOrg!.id, effectiveTargetEnvId!),
    enabled: !!currentOrg?.id && !!effectiveTargetEnvId,
  });

  const isLoading = baselineAppsLoading || targetAppsLoading || baselineApisLoading || targetApisLoading;
  const baselineSummary = useMemo(() => summarize(baselineApps, baselineApis), [baselineApps, baselineApis]);
  const targetSummary = useMemo(() => summarize(targetApps, targetApis), [targetApps, targetApis]);

  const baselineAppNames = new Set(baselineApps.map((app) => getAppName(app)));
  const targetAppNames = new Set(targetApps.map((app) => getAppName(app)));
  const onlyInBaseline = Array.from(baselineAppNames).filter((name) => !targetAppNames.has(name)).slice(0, 5);
  const onlyInTarget = Array.from(targetAppNames).filter((name) => !baselineAppNames.has(name)).slice(0, 5);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Environment Comparison" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Compare environments
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              See runtime and API drift between environments without changing the active session.
            </Text>

            <View style={styles.selectorRow}>
              <View style={styles.selectorColumn}>
                <Text variant="labelMedium" style={styles.selectorLabel}>Baseline</Text>
                {environments.map((environment) => {
                  const selected = environment.id === effectiveBaselineEnvId;
                  return (
                    <Pressable
                      key={`baseline-${environment.id}`}
                      onPress={() => setBaselineEnvId(environment.id)}
                      style={[
                        styles.selectorChip,
                        {
                          borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
                          backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.surface,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? theme.colors.primary : theme.colors.onSurface }}>
                        {environment.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.selectorColumn}>
                <Text variant="labelMedium" style={styles.selectorLabel}>Compare to</Text>
                {environments.map((environment) => {
                  const selected = environment.id === effectiveTargetEnvId;
                  return (
                    <Pressable
                      key={`target-${environment.id}`}
                      onPress={() => setTargetEnvId(environment.id)}
                      style={[
                        styles.selectorChip,
                        {
                          borderColor: selected ? anypointColors.secondary : theme.colors.outlineVariant,
                          backgroundColor: selected ? anypointColors.secondary + '12' : theme.colors.surface,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? anypointColors.secondary : theme.colors.onSurface }}>
                        {environment.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.compareHeader}>
              <Text style={styles.metricHeader}>Metric</Text>
              <Text style={[styles.envHeader, { color: theme.colors.primary }]}>{baselineEnv?.name ?? 'Baseline'}</Text>
              <Text style={[styles.envHeader, { color: anypointColors.secondary }]}>{targetEnv?.name ?? 'Compare'}</Text>
            </View>

            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="bodySmall" style={styles.loadingText}>Loading comparison data...</Text>
              </View>
            ) : (
              <>
                <View style={[styles.compareRow, { borderTopColor: theme.colors.outlineVariant }]}>
                  <Text style={styles.metricHeader}>Applications</Text>
                  <Text style={styles.valueCell}>{baselineSummary.applications}</Text>
                  <Text style={styles.valueCell}>{targetSummary.applications}</Text>
                </View>
                <View style={[styles.compareRow, { borderTopColor: theme.colors.outlineVariant }]}>
                  <Text style={styles.metricHeader}>Running</Text>
                  <Text style={styles.valueCell}>{baselineSummary.running}</Text>
                  <Text style={styles.valueCell}>{targetSummary.running}</Text>
                </View>
                <View style={[styles.compareRow, { borderTopColor: theme.colors.outlineVariant }]}>
                  <Text style={styles.metricHeader}>Failed</Text>
                  <Text style={styles.valueCell}>{baselineSummary.failed}</Text>
                  <Text style={styles.valueCell}>{targetSummary.failed}</Text>
                </View>
                <View style={[styles.compareRow, { borderTopColor: theme.colors.outlineVariant }]}>
                  <Text style={styles.metricHeader}>Managed APIs</Text>
                  <Text style={styles.valueCell}>{baselineSummary.apis}</Text>
                  <Text style={styles.valueCell}>{targetSummary.apis}</Text>
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Differences
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              A quick read on which applications appear only on one side.
            </Text>

            <View style={styles.diffColumns}>
              <View style={styles.diffColumn}>
                <Text style={[styles.diffTitle, { color: theme.colors.primary }]}>
                  Only in {baselineEnv?.name ?? 'baseline'}
                </Text>
                {onlyInBaseline.length > 0 ? onlyInBaseline.map((name) => (
                  <Text key={`baseline-${name}`} style={styles.diffItem}>{name}</Text>
                )) : <Text style={styles.emptyCopy}>No unique applications found.</Text>}
              </View>

              <View style={styles.diffColumn}>
                <Text style={[styles.diffTitle, { color: anypointColors.secondary }]}>
                  Only in {targetEnv?.name ?? 'compare'}
                </Text>
                {onlyInTarget.length > 0 ? onlyInTarget.map((name) => (
                  <Text key={`target-${name}`} style={styles.diffItem}>{name}</Text>
                )) : <Text style={styles.emptyCopy}>No unique applications found.</Text>}
              </View>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 10,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  selectorColumn: {
    flex: 1,
    gap: 8,
  },
  selectorLabel: {
    color: theme.colors.onSurfaceVariant,
  },
  selectorChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  compareHeader: {
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
  metricHeader: {
    flex: 1,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
  envHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  valueCell: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    color: theme.colors.onSurfaceVariant,
  },
  diffColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  diffColumn: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceVariant,
    padding: 14,
  },
  diffTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  diffItem: {
    color: theme.colors.onSurface,
    fontSize: 13,
    marginBottom: 6,
  },
  emptyCopy: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
  },
});

export default EnvironmentComparisonScreen;

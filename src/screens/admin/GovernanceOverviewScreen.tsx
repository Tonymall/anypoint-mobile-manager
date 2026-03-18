import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../../stores/authStore';
import * as governanceService from '../../services/governanceService';
import { anypointColors } from '../../theme';

function formatValidatedAt(raw?: string): string {
  if (!raw) return 'Unknown';
  const ts = new Date(raw).getTime();
  if (Number.isNaN(ts)) return raw;
  const diffMinutes = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

const GovernanceOverviewScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const currentOrg = useAuthStore((s) => s.currentOrganization);

  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['admin-governance', 'profiles', currentOrg?.id],
    queryFn: () => governanceService.getProfiles(currentOrg!.id, { limit: 20 }),
    enabled: !!currentOrg?.id,
  });

  const { data: rulesets, isLoading: rulesetsLoading } = useQuery({
    queryKey: ['admin-governance', 'rulesets', currentOrg?.id],
    queryFn: () => governanceService.getRulesets(currentOrg!.id, { limit: 20 }),
    enabled: !!currentOrg?.id,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ['admin-governance', 'reports', currentOrg?.id],
    queryFn: () => governanceService.getConformanceReports(currentOrg!.id, { limit: 20 }),
    enabled: !!currentOrg?.id,
  });

  const profileItems = profiles?.data ?? [];
  const rulesetItems = rulesets?.data ?? [];
  const reportItems = reports?.data ?? [];

  const profileCounts = useMemo(() => ({
    active: profileItems.filter((profile) => profile.status === 'active').length,
    draft: profileItems.filter((profile) => profile.status === 'draft').length,
    archived: profileItems.filter((profile) => profile.status === 'archived').length,
  }), [profileItems]);

  const violationSummary = useMemo(() => {
    let total = 0;
    let errors = 0;
    let warnings = 0;
    let info = 0;

    for (const report of reportItems) {
      for (const violation of report.violations ?? []) {
        total += 1;
        if (violation.severity === 'error') errors += 1;
        else if (violation.severity === 'warning') warnings += 1;
        else info += 1;
      }
    }

    return { total, errors, warnings, info };
  }, [reportItems]);

  const nonConformantReports = reportItems.filter((report) => report.status === 'non-conformant');
  const notValidatedCount = reportItems.filter((report) => report.status === 'not-validated').length;
  const rulesetCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ruleset of rulesetItems) {
      const key = ruleset.category || 'Uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  }, [rulesetItems]);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="API Governance" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.heroCard}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.heroTitle}>
              Governance operations
            </Text>
            <Text variant="bodyMedium" style={styles.heroCopy}>
              Review profile coverage, ruleset mix, and current conformance drift for APIs in {currentOrg?.name ?? 'this organization'}.
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {profilesLoading ? '...' : profileItems.length}
            </Text>
            <Text style={styles.statLabel}>Profiles</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.mulePurple + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.mulePurple }]}>
              {rulesetsLoading ? '...' : rulesetItems.length}
            </Text>
            <Text style={styles.statLabel}>Rulesets</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.warning }]}>
              {reportsLoading ? '...' : nonConformantReports.length}
            </Text>
            <Text style={styles.statLabel}>Non-conformant</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.error + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.error }]}>
              {reportsLoading ? '...' : violationSummary.total}
            </Text>
            <Text style={styles.statLabel}>Violations</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Profile coverage
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Active profiles determine how much of your API estate is being evaluated right now.
            </Text>

            <View style={styles.splitRow}>
              <View style={[styles.chipStat, { backgroundColor: anypointColors.success + '12' }]}>
                <Text style={[styles.chipValue, { color: anypointColors.success }]}>{profileCounts.active}</Text>
                <Text style={styles.chipLabel}>Active</Text>
              </View>
              <View style={[styles.chipStat, { backgroundColor: anypointColors.warning + '12' }]}>
                <Text style={[styles.chipValue, { color: anypointColors.warning }]}>{profileCounts.draft}</Text>
                <Text style={styles.chipLabel}>Draft</Text>
              </View>
              <View style={[styles.chipStat, { backgroundColor: theme.colors.onSurfaceVariant + '12' }]}>
                <Text style={[styles.chipValue, { color: theme.colors.onSurfaceVariant }]}>{profileCounts.archived}</Text>
                <Text style={styles.chipLabel}>Archived</Text>
              </View>
            </View>

            {(profileItems.length > 0 ? profileItems : []).map((profile) => (
              <View key={profile.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '12' }]}>
                  <Icon name="shield-check-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{profile.name}</Text>
                  <Text style={styles.rowMeta}>
                    {(profile.rulesets?.length ?? 0)} ruleset{(profile.rulesets?.length ?? 0) === 1 ? '' : 's'} - {profile.status}
                  </Text>
                </View>
                <Text style={[styles.statusText, { color: profile.status === 'active' ? anypointColors.success : anypointColors.warning }]}>
                  {profile.status}
                </Text>
              </View>
            ))}

            {profileItems.length === 0 ? (
              <Text variant="bodySmall" style={styles.emptyState}>
                No governance profiles were returned.
              </Text>
            ) : null}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Ruleset library
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Category spread helps show whether governance is balanced between security, compliance, and quality controls.
            </Text>

            <View style={styles.categoryWrap}>
              {rulesetCategories.map(([category, count]) => (
                <View key={category} style={[styles.categoryPill, { backgroundColor: anypointColors.mulePurple + '12' }]}>
                  <Text style={[styles.categoryText, { color: anypointColors.mulePurple }]}>
                    {category} - {count}
                  </Text>
                </View>
              ))}
            </View>

            {(rulesetItems.slice(0, 8)).map((ruleset) => (
              <View key={ruleset.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={[styles.iconWrap, { backgroundColor: anypointColors.mulePurple + '12' }]}>
                  <Icon name="book-open-variant" size={18} color={anypointColors.mulePurple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{ruleset.name}</Text>
                  <Text style={styles.rowMeta}>
                    {ruleset.category} - {(ruleset.rules?.length ?? 0)} rule{(ruleset.rules?.length ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Conformance focus
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              {notValidatedCount > 0 ? `${notValidatedCount} APIs still need validation.` : 'The latest validation results are listed below.'}
            </Text>

            <View style={styles.splitRow}>
              <View style={[styles.chipStat, { backgroundColor: anypointColors.error + '12' }]}>
                <Text style={[styles.chipValue, { color: anypointColors.error }]}>{violationSummary.errors}</Text>
                <Text style={styles.chipLabel}>Errors</Text>
              </View>
              <View style={[styles.chipStat, { backgroundColor: anypointColors.warning + '12' }]}>
                <Text style={[styles.chipValue, { color: anypointColors.warning }]}>{violationSummary.warnings}</Text>
                <Text style={styles.chipLabel}>Warnings</Text>
              </View>
              <View style={[styles.chipStat, { backgroundColor: theme.colors.primary + '12' }]}>
                <Text style={[styles.chipValue, { color: theme.colors.primary }]}>{violationSummary.info}</Text>
                <Text style={styles.chipLabel}>Info</Text>
              </View>
            </View>

            {reportItems.length > 0 ? reportItems.map((report) => {
              const color = report.status === 'conformant'
                ? anypointColors.success
                : report.status === 'non-conformant'
                  ? anypointColors.warning
                  : theme.colors.onSurfaceVariant;
              const topViolation = report.violations?.[0];

              return (
                <View key={`${report.apiId}-${report.profileId}`} style={[styles.reportCard, { borderColor: theme.colors.outlineVariant }]}>
                  <View style={styles.reportHeader}>
                    <View style={[styles.iconWrap, { backgroundColor: color + '12' }]}>
                      <Icon
                        name={report.status === 'conformant' ? 'check-circle-outline' : 'shield-alert-outline'}
                        size={18}
                        color={color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{report.apiName}</Text>
                      <Text style={styles.rowMeta}>{report.profileName} - {formatValidatedAt(report.validatedAt)}</Text>
                    </View>
                    <Text style={[styles.statusText, { color }]}>{report.status}</Text>
                  </View>

                  <View style={styles.reportMetrics}>
                    <Text style={styles.reportMetric}>{report.violations?.length ?? 0} violation{(report.violations?.length ?? 0) === 1 ? '' : 's'}</Text>
                    {topViolation ? (
                      <Text style={styles.reportMetric}>
                        Top: {topViolation.ruleName} ({topViolation.severity})
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            }) : (
              <Text variant="bodySmall" style={styles.emptyState}>
                No conformance reports returned yet for this organization.
              </Text>
            )}
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
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
  },
  heroTitle: {
    fontWeight: '800',
    marginBottom: 8,
  },
  heroCopy: {
    color: theme.colors.onSurfaceVariant,
    lineHeight: 21,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  statLabel: {
    marginTop: 4,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 10,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  chipStat: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  chipValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  chipLabel: {
    marginTop: 4,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: {
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    marginTop: 2,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  emptyState: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 8,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  categoryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reportCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 10,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportMetrics: {
    marginTop: 10,
    gap: 4,
  },
  reportMetric: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
  },
});

export default GovernanceOverviewScreen;

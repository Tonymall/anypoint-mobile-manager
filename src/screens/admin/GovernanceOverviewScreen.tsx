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

  const reportItems = reports?.data ?? [];
  const nonConformantCount = reportItems.filter((report) => report.status === 'non-conformant').length;
  const notValidatedCount = reportItems.filter((report) => report.status === 'not-validated').length;

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
              Governance at a glance
            </Text>
            <Text variant="bodyMedium" style={styles.heroCopy}>
              Review profiles, rulesets, and the latest conformance status for APIs in {currentOrg?.name ?? 'this organization'}.
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {profilesLoading ? '...' : profiles?.data?.length ?? 0}
            </Text>
            <Text style={styles.statLabel}>Profiles</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.mulePurple + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.mulePurple }]}>
              {rulesetsLoading ? '...' : rulesets?.data?.length ?? 0}
            </Text>
            <Text style={styles.statLabel}>Rulesets</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.warning }]}>
              {reportsLoading ? '...' : nonConformantCount}
            </Text>
            <Text style={styles.statLabel}>Non-conformant</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Recent conformance reports
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              {notValidatedCount > 0 ? `${notValidatedCount} APIs are still waiting to be validated.` : 'The latest validation results are listed below.'}
            </Text>

            {reportItems.length > 0 ? reportItems.map((report) => {
              const color = report.status === 'conformant'
                ? anypointColors.success
                : report.status === 'non-conformant'
                  ? anypointColors.warning
                  : theme.colors.onSurfaceVariant;

              return (
                <View key={`${report.apiId}-${report.profileId}`} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                  <View style={[styles.iconWrap, { backgroundColor: color + '12' }]}>
                    <Icon
                      name={report.status === 'conformant' ? 'check-circle-outline' : 'shield-alert-outline'}
                      size={18}
                      color={color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{report.apiName}</Text>
                    <Text style={styles.rowMeta}>{report.profileName}</Text>
                  </View>
                  <Text style={[styles.statusText, { color }]}>{report.status}</Text>
                </View>
              );
            }) : (
              <Text variant="bodySmall" style={styles.emptyState}>
                No conformance reports returned yet for this organization.
              </Text>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Active governance profiles
            </Text>
            {(profiles?.data ?? []).length > 0 ? (profiles?.data ?? []).map((profile) => (
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
              </View>
            )) : (
              <Text variant="bodySmall" style={styles.emptyState}>
                No governance profiles were returned.
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
    marginBottom: 8,
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
});

export default GovernanceOverviewScreen;

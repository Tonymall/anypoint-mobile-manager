import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEnvironments } from '../../hooks/queries';
import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';
import * as controlPlaneInsightsService from '../../services/controlPlaneInsightsService';

const APIControlPlaneScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const currentOrg = useAuthStore((state) => state.currentOrganization);
  const currentEnv = useAuthStore((state) => state.currentEnvironment);
  const { data: environments = [] } = useEnvironments(currentOrg?.id);

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(currentEnv?.id ?? null);
  const effectiveEnvId = selectedEnvId ?? environments[0]?.id ?? null;

  const managedApisQuery = useQuery({
    queryKey: ['admin-api-control-plane', 'managed-service-apis', currentOrg?.id, effectiveEnvId],
    queryFn: () => controlPlaneInsightsService.getManagedServiceApis(currentOrg!.id, effectiveEnvId!),
    enabled: !!currentOrg?.id && !!effectiveEnvId,
  });

  const permissionsQuery = useQuery({
    queryKey: ['admin-api-control-plane', 'gateway-permissions', currentOrg?.id, effectiveEnvId],
    queryFn: () => controlPlaneInsightsService.getGatewayPermissions(currentOrg!.id, effectiveEnvId!),
    enabled: !!currentOrg?.id && !!effectiveEnvId,
  });

  const managedApis = managedApisQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];
  const subjects = new Set(permissions.map((entry) => entry.subject)).size;
  const permissionTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of permissions) {
      counts.set(entry.permission, (counts.get(entry.permission) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  }, [permissions]);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="API Control Plane" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>Gateway and managed service APIs</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              xAPI-backed API Manager surfaces for environment-scoped service APIs and gateway permissions.
            </Text>

            <View style={styles.chipWrap}>
              {environments.map((environment) => {
                const selected = effectiveEnvId === environment.id;
                return (
                  <Pressable
                    key={environment.id}
                    onPress={() => setSelectedEnvId(environment.id)}
                    style={[
                      styles.chip,
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
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{managedApis.length}</Text>
            <Text style={styles.statLabel}>Managed service APIs</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.secondary + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.secondary }]}>{permissions.length}</Text>
            <Text style={styles.statLabel}>Permissions</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.warning }]}>{subjects}</Text>
            <Text style={styles.statLabel}>Subjects</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Managed service APIs</Text>
            {managedApis.length > 0 ? managedApis.map((api) => (
              <View key={api.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{api.name}</Text>
                  <Text style={styles.rowMeta}>
                    {api.stage ?? 'Unknown stage'}{api.autodiscoveryApiName ? ` • ${api.autodiscoveryApiName}` : ''}
                  </Text>
                </View>
                <Text style={styles.statusText}>{api.state ?? 'Unknown'}</Text>
              </View>
            )) : <Text style={styles.emptyCopy}>No managed service APIs were returned.</Text>}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Gateway permissions</Text>
            <View style={styles.pillWrap}>
              {permissionTypes.length > 0 ? permissionTypes.slice(0, 6).map(([permission, count]) => (
                <View key={permission} style={[styles.pill, { backgroundColor: anypointColors.secondary + '12' }]}>
                  <Text style={[styles.pillText, { color: anypointColors.secondary }]}>{permission} - {count}</Text>
                </View>
              )) : <Text style={styles.emptyCopy}>No gateway permissions were returned.</Text>}
            </View>

            {permissions.slice(0, 12).map((permission) => (
              <View key={permission.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{permission.subject}</Text>
                  <Text style={styles.rowMeta}>{permission.resourceType ?? 'Gateway resource'}</Text>
                </View>
                <Text style={styles.statusText}>{permission.permission}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 20 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { color: theme.colors.onSurfaceVariant, marginBottom: 10, lineHeight: 18 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 10 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  statLabel: { marginTop: 4, color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { marginTop: 2, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  statusText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 12, fontWeight: '700' },
  emptyCopy: { color: theme.colors.onSurfaceVariant, fontSize: 12 },
});

export default APIControlPlaneScreen;

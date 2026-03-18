import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Appbar,
  Button,
  Card,
  Divider,
  Dialog,
  Portal,
  Text,
  TextInput,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { FALLBACK_API_POLICY_CATALOG } from '../../constants/apiPolicyCatalog';
import {
  apiManagerKeys,
  useAPIAssetSummary,
  useAPIContracts,
  useAPIGovernanceReport,
  useAPIPolicies,
  useAPIPolicyTemplates,
  useAPISLATiers,
  useManagedAPI,
} from '../../hooks/queries';
import * as apiManagerService from '../../services/apiManagerService';
import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';
import { hapticError, hapticSuccess } from '../../utils/haptics';

type ContractActionState = {
  contractId: number | null;
  action: 'approve' | 'reject' | null;
};

type TierDraft = {
  name: string;
  description: string;
  maximumRequests: string;
  periodSeconds: string;
  autoApprove: boolean;
};

function normalizePolicyKey(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const APIDetailScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const currentOrg = useAuthStore((state) => state.currentOrganization);
  const currentEnv = useAuthStore((state) => state.currentEnvironment);
  const { apiId: apiIdParam } = useLocalSearchParams<{ apiId?: string }>();
  const apiId = Number(apiIdParam);

  const [contractAction, setContractAction] = useState<ContractActionState>({
    contractId: null,
    action: null,
  });
  const [tierDialogVisible, setTierDialogVisible] = useState(false);
  const [tierDraft, setTierDraft] = useState<TierDraft>({
    name: '',
    description: '',
    maximumRequests: '1000',
    periodSeconds: '60',
    autoApprove: true,
  });
  const [tierSubmitting, setTierSubmitting] = useState(false);
  const [policyApplyBusyId, setPolicyApplyBusyId] = useState<string | null>(null);

  const { data: api, isLoading } = useManagedAPI(apiId);
  const { data: policies } = useAPIPolicies(apiId);
  const { data: policyTemplates } = useAPIPolicyTemplates(apiId);
  const { data: slaTiers } = useAPISLATiers(apiId);
  const { data: contractsResponse } = useAPIContracts(apiId);
  const { data: apiAsset } = useAPIAssetSummary(apiId);
  const { data: governanceReport } = useAPIGovernanceReport(apiId);

  const mergedPolicyTemplates = useMemo(() => {
    const live = policyTemplates ?? [];
    if (live.length === 0) {
      return FALLBACK_API_POLICY_CATALOG;
    }

    const seen = new Set<string>();
    const merged = [...live];
    for (const template of live) {
      seen.add(normalizePolicyKey(template.id));
      seen.add(normalizePolicyKey(template.name));
    }

    for (const fallback of FALLBACK_API_POLICY_CATALOG) {
      if (seen.has(normalizePolicyKey(fallback.id)) || seen.has(normalizePolicyKey(fallback.name))) {
        continue;
      }
      merged.push(fallback);
    }
    return merged;
  }, [policyTemplates]);

  const appliedPolicyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const policy of policies ?? []) {
      keys.add(normalizePolicyKey(policy.assetId));
      keys.add(normalizePolicyKey(policy.policyTemplateId));
    }
    return keys;
  }, [policies]);

  const contracts = contractsResponse?.data ?? [];
  const pendingContracts = contracts.filter((contract) => contract.status === 'PENDING');
  const nextPolicyOrder = (policies?.length ?? 0) + 1;

  const handleCreateTier = async () => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return;
    const maximumRequests = Number(tierDraft.maximumRequests);
    const periodSeconds = Number(tierDraft.periodSeconds);
    if (!tierDraft.name.trim() || !Number.isFinite(maximumRequests) || !Number.isFinite(periodSeconds)) {
      hapticError();
      return;
    }

    setTierSubmitting(true);
    try {
      await apiManagerService.createSLATier(currentOrg.id, currentEnv.id, apiId, {
        name: tierDraft.name.trim(),
        description: tierDraft.description.trim(),
        autoApprove: tierDraft.autoApprove,
        limits: [
          {
            maximumRequests,
            timePeriodInMilliseconds: periodSeconds * 1000,
            visible: true,
          },
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.slaTiers(currentOrg.id, currentEnv.id, apiId),
      });
      setTierDialogVisible(false);
      setTierDraft({
        name: '',
        description: '',
        maximumRequests: '1000',
        periodSeconds: '60',
        autoApprove: true,
      });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setTierSubmitting(false);
    }
  };

  const handleContractAction = async (
    contractId: number,
    action: 'approve' | 'reject',
  ) => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return;

    setContractAction({ contractId, action });
    try {
      if (action === 'approve') {
        await apiManagerService.approveContract(currentOrg.id, currentEnv.id, apiId, contractId);
      } else {
        await apiManagerService.rejectContract(currentOrg.id, currentEnv.id, apiId, contractId);
      }
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.contracts(currentOrg.id, currentEnv.id, apiId),
      });
      hapticSuccess();
    } catch (error) {
      hapticError();
    } finally {
      setContractAction({ contractId: null, action: null });
    }
  };

  const handleQuickApplyPolicy = async (template: apiManagerService.APIPolicyTemplate) => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return;
    if (!template.groupId || !template.assetId || !template.assetVersion) {
      hapticError();
      return;
    }

    setPolicyApplyBusyId(template.id);
    try {
      await apiManagerService.applyPolicy(currentOrg.id, currentEnv.id, apiId, {
        policyTemplateId: template.id,
        groupId: template.groupId,
        assetId: template.assetId,
        assetVersion: template.assetVersion,
        configuration: {},
        order: nextPolicyOrder,
      });
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.policies(currentOrg.id, currentEnv.id, apiId),
      });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setPolicyApplyBusyId(null);
    }
  };

  const openDocs = async (url?: string | null) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      hapticError();
    }
  };

  const title = api?.instanceLabel || apiAsset?.exchangeAssetName || `API ${apiId}`;

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="API Details" titleStyle={styles.headerTitle} subtitle={title} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.heroCard}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.heroTitle}>
              {title}
            </Text>
            <Text variant="bodyMedium" style={styles.heroCopy}>
              HAR-backed API Manager detail view with policies, contracts, SLA tiers, and governance state in one place.
            </Text>

            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
                <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                  {isLoading ? '...' : (policies?.length ?? api?.policies?.length ?? 0)}
                </Text>
                <Text style={styles.statLabel}>Policies</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: anypointColors.accent + '12' }]}>
                <Text style={[styles.statValue, { color: anypointColors.accent }]}>
                  {slaTiers?.length ?? api?.slaTiers?.length ?? 0}
                </Text>
                <Text style={styles.statLabel}>SLA tiers</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
                <Text style={[styles.statValue, { color: anypointColors.warning }]}>
                  {contracts.length}
                </Text>
                <Text style={styles.statLabel}>Contracts</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: anypointColors.success + '12' }]}>
                <Text style={[styles.statValue, { color: anypointColors.success }]}>
                  {pendingContracts.length}
                </Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Overview
            </Text>
            <View style={styles.infoList}>
              <InfoItem label="Status" value={api?.status ?? 'Unknown'} />
              <InfoItem label="Technology" value={api?.technology ?? 'Unknown'} />
              <InfoItem label="Endpoint" value={api?.endpointUri ?? 'Not exposed'} mono />
              <InfoItem label="Autodiscovery" value={api?.autodiscoveryInstanceName ?? 'Not set'} />
              <InfoItem label="Asset" value={apiAsset?.exchangeAssetName ?? api?.assetId ?? 'Unknown'} />
              <InfoItem label="Governance" value={governanceReport?.status ?? 'Unknown'} />
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Applied policies
            </Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Live policy state comes from the API Manager policies endpoint. Available policy templates below are enriched from the xAPI template catalog captured in your HAR.
            </Text>

            {(policies ?? []).length > 0 ? (
              (policies ?? []).map((policy) => (
                <View key={policy.id} style={[styles.row, { borderTopColor: theme.colors.outlineVariant }]}>
                  <View style={[styles.iconWrap, { backgroundColor: anypointColors.primary + '12' }]}>
                    <Icon name="shield-check-outline" size={18} color={anypointColors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{policy.assetId || policy.policyTemplateId}</Text>
                    <Text style={styles.rowMeta}>
                      order {policy.order} • {policy.disabled ? 'disabled' : 'active'}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text variant="bodySmall" style={styles.emptyCopy}>
                No applied policies returned for this API instance.
              </Text>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeaderInline}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Policy catalog
                </Text>
                <Text variant="bodySmall" style={styles.sectionSubtitle}>
                  This catalog includes the policy set you called out, with live template metadata when the control plane exposes it.
                </Text>
              </View>
            </View>

            {mergedPolicyTemplates.map((template) => {
              const applied =
                appliedPolicyKeys.has(normalizePolicyKey(template.id))
                || appliedPolicyKeys.has(normalizePolicyKey(template.name));
              const canQuickApply = !applied && !template.isSlaBased && !!template.groupId && !!template.assetId && !!template.assetVersion;

              return (
                <View key={template.id} style={[styles.policyCard, { borderColor: theme.colors.outlineVariant }]}>
                  <View style={styles.policyHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{template.name}</Text>
                      <Text style={styles.rowMeta}>{template.category}</Text>
                    </View>
                    <Text style={[styles.badge, { color: applied ? anypointColors.success : theme.colors.onSurfaceVariant }]}>
                      {applied ? 'Applied' : 'Available'}
                    </Text>
                  </View>
                  <Text style={styles.policyDescription}>{template.description}</Text>
                  <View style={styles.metaChipRow}>
                    {template.isSlaBased ? (
                      <Text style={[styles.metaChip, { color: anypointColors.warning }]}>SLA based</Text>
                    ) : null}
                    {!canQuickApply && !applied ? (
                      <Text style={styles.metaChip}>Config needed</Text>
                    ) : null}
                    {template.providedCharacteristics.slice(0, 2).map((value) => (
                      <Text key={value} style={styles.metaChip}>
                        {value}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.templateActions}>
                    {canQuickApply ? (
                      <Button
                        compact
                        mode="contained-tonal"
                        onPress={() => void handleQuickApplyPolicy(template)}
                        loading={policyApplyBusyId === template.id}
                      >
                        Quick apply
                      </Button>
                    ) : null}
                    {template.docsUrl ? (
                      <Button
                        compact
                        mode="text"
                        onPress={() => void openDocs(template.docsUrl)}
                        style={styles.inlineButton}
                      >
                        Learn more
                      </Button>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeaderInline}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  SLA tiers
                </Text>
              </View>
              <Button mode="contained-tonal" compact onPress={() => setTierDialogVisible(true)}>
                Add tier
              </Button>
            </View>
            {(slaTiers ?? []).length > 0 ? (
              (slaTiers ?? []).map((tier) => (
                <View key={tier.id} style={[styles.row, { borderTopColor: theme.colors.outlineVariant }]}>
                  <View style={[styles.iconWrap, { backgroundColor: anypointColors.accent + '12' }]}>
                    <Icon name="speedometer" size={18} color={anypointColors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{tier.name}</Text>
                    <Text style={styles.rowMeta}>
                      {tier.autoApprove ? 'Auto-approve' : 'Manual approval'} • {tier.status}
                    </Text>
                    {(tier.limits ?? []).map((limit, index) => (
                      <Text key={`${tier.id}-${index}`} style={styles.tierLimit}>
                        {limit.maximumRequests.toLocaleString()} requests / {Math.round(limit.timePeriodInMilliseconds / 1000)}s
                      </Text>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <Text variant="bodySmall" style={styles.emptyCopy}>
                No SLA tiers returned for this API instance.
              </Text>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Contracts
            </Text>
            {contracts.length > 0 ? (
              contracts.map((contract) => {
                const actionBusy = contractAction.contractId === contract.id;
                return (
                  <View key={contract.id} style={[styles.contractCard, { borderColor: theme.colors.outlineVariant }]}>
                    <View style={styles.policyHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{contract.applicationName}</Text>
                        <Text style={styles.rowMeta}>
                          {contract.tierName || 'No tier'} • requested {contract.requestedDate ? new Date(contract.requestedDate).toLocaleDateString() : 'unknown'}
                        </Text>
                      </View>
                      <Text style={[styles.badge, { color: contract.status === 'APPROVED' ? anypointColors.success : contract.status === 'PENDING' ? anypointColors.warning : theme.colors.onSurfaceVariant }]}>
                        {contract.status}
                      </Text>
                    </View>

                    {contract.status === 'PENDING' ? (
                      <View style={styles.contractActions}>
                        <Button
                          mode="contained-tonal"
                          compact
                          onPress={() => void handleContractAction(contract.id, 'approve')}
                          loading={actionBusy && contractAction.action === 'approve'}
                        >
                          Approve
                        </Button>
                        <Button
                          mode="outlined"
                          compact
                          onPress={() => void handleContractAction(contract.id, 'reject')}
                          loading={actionBusy && contractAction.action === 'reject'}
                        >
                          Reject
                        </Button>
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text variant="bodySmall" style={styles.emptyCopy}>
                No contracts returned for this API instance.
              </Text>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={tierDialogVisible} onDismiss={() => setTierDialogVisible(false)}>
          <Dialog.Title>Create SLA tier</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Tier name"
              value={tierDraft.name}
              onChangeText={(value) => setTierDraft((current) => ({ ...current, name: value }))}
              style={styles.dialogInput}
            />
            <TextInput
              mode="outlined"
              label="Description"
              value={tierDraft.description}
              onChangeText={(value) => setTierDraft((current) => ({ ...current, description: value }))}
              style={styles.dialogInput}
            />
            <TextInput
              mode="outlined"
              label="Max requests"
              value={tierDraft.maximumRequests}
              onChangeText={(value) => setTierDraft((current) => ({ ...current, maximumRequests: value }))}
              keyboardType="number-pad"
              style={styles.dialogInput}
            />
            <TextInput
              mode="outlined"
              label="Period (seconds)"
              value={tierDraft.periodSeconds}
              onChangeText={(value) => setTierDraft((current) => ({ ...current, periodSeconds: value }))}
              keyboardType="number-pad"
              style={styles.dialogInput}
            />
            <View style={styles.autoApproveRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                {tierDraft.autoApprove ? 'Auto-approve applications' : 'Manual approval required'}
              </Text>
              <Button
                compact
                mode="text"
                onPress={() =>
                  setTierDraft((current) => ({ ...current, autoApprove: !current.autoApprove }))
                }
              >
                Toggle
              </Button>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setTierDialogVisible(false)}>Cancel</Button>
            <Button onPress={() => void handleCreateTier()} loading={tierSubmitting}>
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
};

const InfoItem: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        style={{
          color: theme.colors.onSurface,
          fontFamily: mono ? 'monospace' : undefined,
        }}
      >
        {value}
      </Text>
      <Divider />
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
    marginBottom: 6,
  },
  heroCopy: {
    color: theme.colors.onSurfaceVariant,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
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
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoList: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
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
  emptyCopy: {
    color: theme.colors.onSurfaceVariant,
  },
  policyCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 10,
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
  },
  policyDescription: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  metaChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  metaChip: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '600',
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  templateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tierLimit: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 6,
  },
  contractCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 10,
  },
  contractActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  dialogInput: {
    marginBottom: 10,
  },
  autoApproveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
});

export default APIDetailScreen;

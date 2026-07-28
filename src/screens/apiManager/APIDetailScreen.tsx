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
  status: 'ACTIVE' | 'DEPRECATED';
};

type TierDialogState = {
  visible: boolean;
  mode: 'create' | 'edit';
  tierId: number | null;
};

type PolicyDialogState = {
  visible: boolean;
  loading: boolean;
  submitting: boolean;
  template: apiManagerService.APIPolicyTemplate | null;
  values: Record<string, string | boolean>;
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
  const [tierDraft, setTierDraft] = useState<TierDraft>({
    name: '',
    description: '',
    maximumRequests: '1000',
    periodSeconds: '60',
    autoApprove: true,
    status: 'ACTIVE',
  });
  const [tierDialog, setTierDialog] = useState<TierDialogState>({
    visible: false,
    mode: 'create',
    tierId: null,
  });
  const [tierSubmitting, setTierSubmitting] = useState(false);
  const [tierDeleteBusyId, setTierDeleteBusyId] = useState<number | null>(null);
  const [policyApplyBusyId, setPolicyApplyBusyId] = useState<string | null>(null);
  const [policyRemoveBusyId, setPolicyRemoveBusyId] = useState<number | null>(null);
  const [policyDialog, setPolicyDialog] = useState<PolicyDialogState>({
    visible: false,
    loading: false,
    submitting: false,
    template: null,
    values: {},
  });

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

  const resetTierDraft = () => {
    setTierDraft({
      name: '',
      description: '',
      maximumRequests: '1000',
      periodSeconds: '60',
      autoApprove: true,
      status: 'ACTIVE',
    });
  };

  const openCreateTierDialog = () => {
    resetTierDraft();
    setTierDialog({
      visible: true,
      mode: 'create',
      tierId: null,
    });
  };

  const openEditTierDialog = (tier: NonNullable<typeof slaTiers>[number]) => {
    const firstLimit = tier.limits?.[0];
    setTierDraft({
      name: tier.name,
      description: tier.description ?? '',
      maximumRequests: firstLimit ? String(firstLimit.maximumRequests) : '1000',
      periodSeconds: firstLimit ? String(Math.round(firstLimit.timePeriodInMilliseconds / 1000)) : '60',
      autoApprove: tier.autoApprove,
      status: tier.status,
    });
    setTierDialog({
      visible: true,
      mode: 'edit',
      tierId: tier.id,
    });
  };

  const closeTierDialog = () => {
    setTierDialog({
      visible: false,
      mode: 'create',
      tierId: null,
    });
    resetTierDraft();
  };

  const handleSubmitTier = async () => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return;
    const maximumRequests = Number(tierDraft.maximumRequests);
    const periodSeconds = Number(tierDraft.periodSeconds);
    if (!tierDraft.name.trim() || !Number.isFinite(maximumRequests) || !Number.isFinite(periodSeconds)) {
      hapticError();
      return;
    }

    setTierSubmitting(true);
    try {
      const payload = {
        name: tierDraft.name.trim(),
        description: tierDraft.description.trim(),
        autoApprove: tierDraft.autoApprove,
        status: tierDraft.status,
        limits: [
          {
            maximumRequests,
            timePeriodInMilliseconds: periodSeconds * 1000,
            visible: true,
          },
        ],
      };
      if (tierDialog.mode === 'edit' && tierDialog.tierId) {
        await apiManagerService.updateSLATier(currentOrg.id, currentEnv.id, apiId, tierDialog.tierId, payload);
      } else {
        await apiManagerService.createSLATier(currentOrg.id, currentEnv.id, apiId, payload);
      }
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.slaTiers(currentOrg.id, currentEnv.id, apiId),
      });
      closeTierDialog();
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setTierSubmitting(false);
    }
  };

  const handleDeleteTier = async (tierId: number) => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return;
    setTierDeleteBusyId(tierId);
    try {
      await apiManagerService.deleteSLATier(currentOrg.id, currentEnv.id, apiId, tierId);
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.slaTiers(currentOrg.id, currentEnv.id, apiId),
      });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setTierDeleteBusyId(null);
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

  const applyPolicyWithConfiguration = async (
    template: apiManagerService.APIPolicyTemplate,
    configuration: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return false;
    if (!template.groupId || !template.assetId || !template.assetVersion) {
      hapticError();
      return false;
    }

    setPolicyApplyBusyId(template.id);
    try {
      await apiManagerService.applyPolicy(currentOrg.id, currentEnv.id, apiId, {
        policyTemplateId: template.id,
        groupId: template.groupId,
        assetId: template.assetId,
        assetVersion: template.assetVersion,
        configuration,
        order: nextPolicyOrder,
      });
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.policies(currentOrg.id, currentEnv.id, apiId),
      });
      hapticSuccess();
      return true;
    } catch {
      hapticError();
      return false;
    } finally {
      setPolicyApplyBusyId(null);
    }
  };

  const handleRemovePolicy = async (policyId: number) => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return;
    setPolicyRemoveBusyId(policyId);
    try {
      await apiManagerService.removePolicy(currentOrg.id, currentEnv.id, apiId, policyId);
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.policies(currentOrg.id, currentEnv.id, apiId),
      });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setPolicyRemoveBusyId(null);
    }
  };

  const handleOpenPolicyDialog = async (template: apiManagerService.APIPolicyTemplate) => {
    if (!currentOrg?.id || !currentEnv?.id || !apiId) return;
    if (!template.groupId || !template.assetId || !template.assetVersion) {
      hapticError();
      return;
    }

    setPolicyApplyBusyId(template.id);
    setPolicyDialog({
      visible: true,
      loading: true,
      submitting: false,
      template,
      values: {},
    });

    try {
      const templates = await apiManagerService.getPolicyTemplates(currentOrg.id, currentEnv.id, apiId, {
        includeConfiguration: true,
      });
      const detailedTemplate = templates.find((entry) => String(entry.id) === String(template.id)) ?? template;
      if ((detailedTemplate.configurationFields?.length ?? 0) === 0) {
        setPolicyDialog({
          visible: false,
          loading: false,
          submitting: false,
          template: null,
          values: {},
        });
        await applyPolicyWithConfiguration(detailedTemplate, {});
        return;
      }

      const values = Object.fromEntries(
        detailedTemplate.configurationFields.map((field) => [
          field.propertyName,
          field.type === 'boolean'
            ? Boolean(field.defaultValue)
            : field.enumValues?.[0] && field.defaultValue == null
              ? field.enumValues[0]
            : field.defaultValue == null
              ? ''
              : String(field.defaultValue),
        ]),
      );

      setPolicyDialog({
        visible: true,
        loading: false,
        submitting: false,
        template: detailedTemplate,
        values,
      });
    } catch {
      setPolicyDialog({
        visible: false,
        loading: false,
        submitting: false,
        template: null,
        values: {},
      });
      hapticError();
    } finally {
      setPolicyApplyBusyId(null);
    }
  };

  const handleSubmitConfiguredPolicy = async () => {
    const template = policyDialog.template;
    if (!template) return;

    const config: Record<string, unknown> = {};
    for (const field of template.configurationFields) {
      const raw = policyDialog.values[field.propertyName];
      if (!field.optional && (raw === '' || raw == null)) {
        hapticError();
        return;
      }
      if (raw === '' || raw == null) continue;

      if (field.type === 'boolean') {
        config[field.propertyName] = Boolean(raw);
      } else if (field.type === 'int') {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          hapticError();
          return;
        }
        config[field.propertyName] = numeric;
      } else if (field.type === 'array') {
        config[field.propertyName] = String(raw)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
      } else {
        config[field.propertyName] = raw;
      }
    }

    setPolicyDialog((current) => ({ ...current, submitting: true }));
    try {
      const success = await applyPolicyWithConfiguration(template, config);
      if (success) {
        setPolicyDialog({
          visible: false,
          loading: false,
          submitting: false,
          template: null,
          values: {},
        });
      }
    } finally {
      setPolicyDialog((current) => ({ ...current, submitting: false }));
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
                    <Button
                      compact
                      mode="text"
                      onPress={() => void handleRemovePolicy(policy.id)}
                      loading={policyRemoveBusyId === policy.id}
                      style={styles.inlineButton}
                    >
                      Remove
                    </Button>
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
              const canConfigure = !applied && !!template.groupId && !!template.assetId && !!template.assetVersion;

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
                    {!canConfigure && !applied ? (
                      <Text style={styles.metaChip}>Read only</Text>
                    ) : null}
                    {template.providedCharacteristics.slice(0, 2).map((value) => (
                      <Text key={value} style={styles.metaChip}>
                        {value}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.templateActions}>
                    {canConfigure ? (
                      <Button
                        compact
                        mode="contained-tonal"
                        onPress={() => void handleOpenPolicyDialog(template)}
                        loading={policyApplyBusyId === template.id}
                      >
                        Configure
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
              <Button mode="contained-tonal" compact onPress={openCreateTierDialog}>
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
                    <View style={styles.tierActions}>
                      <Button compact mode="text" onPress={() => openEditTierDialog(tier)}>
                        Edit
                      </Button>
                      <Button
                        compact
                        mode="text"
                        textColor={anypointColors.warning}
                        onPress={() => void handleDeleteTier(tier.id)}
                        loading={tierDeleteBusyId === tier.id}
                      >
                        Delete
                      </Button>
                    </View>
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
        <Dialog visible={tierDialog.visible} onDismiss={closeTierDialog}>
          <Dialog.Title>{tierDialog.mode === 'edit' ? 'Edit SLA tier' : 'Create SLA tier'}</Dialog.Title>
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
            <View style={styles.autoApproveRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                {tierDraft.status === 'ACTIVE' ? 'Tier is active' : 'Tier is deprecated'}
              </Text>
              <Button
                compact
                mode="text"
                onPress={() =>
                  setTierDraft((current) => ({
                    ...current,
                    status: current.status === 'ACTIVE' ? 'DEPRECATED' : 'ACTIVE',
                  }))
                }
              >
                Toggle
              </Button>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeTierDialog}>Cancel</Button>
            <Button onPress={() => void handleSubmitTier()} loading={tierSubmitting}>
              {tierDialog.mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={policyDialog.visible}
          onDismiss={() =>
            setPolicyDialog({
              visible: false,
              loading: false,
              submitting: false,
              template: null,
              values: {},
            })
          }
        >
          <Dialog.Title>{policyDialog.template?.name ?? 'Configure policy'}</Dialog.Title>
          <Dialog.Content>
            {policyDialog.loading ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Loading policy configuration...
              </Text>
            ) : (
              <>
                <Text variant="bodySmall" style={styles.dialogHelp}>
                  {policyDialog.template?.description ?? 'Set policy values before applying it to this API.'}
                </Text>
                {(policyDialog.template?.configurationFields ?? []).map((field) => {
                  const value = policyDialog.values[field.propertyName];
                  if (field.type === 'boolean') {
                    return (
                      <View key={field.propertyName} style={styles.autoApproveRow}>
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                            {field.name}
                          </Text>
                          {field.description ? (
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {field.description}
                            </Text>
                          ) : null}
                        </View>
                        <Button
                          compact
                          mode="text"
                          onPress={() =>
                            setPolicyDialog((current) => ({
                              ...current,
                              values: {
                                ...current.values,
                                [field.propertyName]: !value,
                              },
                            }))
                          }
                        >
                          {value ? 'On' : 'Off'}
                        </Button>
                      </View>
                    );
                  }

                  if ((field.enumValues?.length ?? 0) > 0) {
                    return (
                      <View key={field.propertyName} style={styles.dialogInput}>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
                          {field.name}
                        </Text>
                        {field.description ? (
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                            {field.description}
                          </Text>
                        ) : null}
                        <View style={styles.optionRow}>
                          {field.enumValues?.map((option) => {
                            const selected = String(value ?? '') === option;
                            return (
                              <Button
                                key={`${field.propertyName}-${option}`}
                                compact
                                mode={selected ? 'contained-tonal' : 'outlined'}
                                onPress={() =>
                                  setPolicyDialog((current) => ({
                                    ...current,
                                    values: {
                                      ...current.values,
                                      [field.propertyName]: option,
                                    },
                                  }))
                                }
                                style={styles.optionButton}
                              >
                                {option}
                              </Button>
                            );
                          })}
                        </View>
                      </View>
                    );
                  }

                  return (
                    <TextInput
                      key={field.propertyName}
                      mode="outlined"
                      label={field.name}
                      value={String(value ?? '')}
                      secureTextEntry={field.sensitive}
                      keyboardType={field.type === 'int' ? 'number-pad' : 'default'}
                      onChangeText={(nextValue) =>
                        setPolicyDialog((current) => ({
                          ...current,
                          values: {
                            ...current.values,
                            [field.propertyName]: nextValue,
                          },
                        }))
                      }
                      style={styles.dialogInput}
                    />
                  );
                })}
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() =>
                setPolicyDialog({
                  visible: false,
                  loading: false,
                  submitting: false,
                  template: null,
                  values: {},
                })
              }
            >
              Cancel
            </Button>
            <Button
              onPress={() => void handleSubmitConfiguredPolicy()}
              loading={policyDialog.submitting}
              disabled={policyDialog.loading}
            >
              Apply
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
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    marginBottom: 4,
  },
  dialogHelp: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
    lineHeight: 18,
  },
  autoApproveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tierActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});

export default APIDetailScreen;

import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Appbar, Portal, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { hapticError, hapticSuccess } from '../../utils/haptics';
import { normalizePolicyKey } from './apiDetail/helpers';
import { type ContractActionState } from './apiDetail/types';
import { createStyles } from './apiDetail/styles';
import { useSLATierActions } from './apiDetail/useSLATierActions';
import { usePolicyActions } from './apiDetail/usePolicyActions';
import HeroCard from './apiDetail/HeroCard';
import OverviewCard from './apiDetail/OverviewCard';
import AppliedPoliciesCard from './apiDetail/AppliedPoliciesCard';
import PolicyCatalogCard from './apiDetail/PolicyCatalogCard';
import SLATiersCard from './apiDetail/SLATiersCard';
import ContractsCard from './apiDetail/ContractsCard';
import TierDialog from './apiDetail/TierDialog';
import PolicyConfigDialog from './apiDetail/PolicyConfigDialog';

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

  const {
    tierDraft,
    setTierDraft,
    tierDialog,
    tierSubmitting,
    tierDeleteBusyId,
    openCreateTierDialog,
    openEditTierDialog,
    closeTierDialog,
    handleSubmitTier,
    handleDeleteTier,
  } = useSLATierActions({ apiId, orgId: currentOrg?.id, envId: currentEnv?.id });

  const {
    policyApplyBusyId,
    policyRemoveBusyId,
    policyDialog,
    setPolicyDialog,
    handleRemovePolicy,
    handleOpenPolicyDialog,
    handleSubmitConfiguredPolicy,
  } = usePolicyActions({ apiId, orgId: currentOrg?.id, envId: currentEnv?.id, nextPolicyOrder });

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
        <HeroCard
          styles={styles}
          title={title}
          isLoading={isLoading}
          api={api}
          policies={policies}
          slaTiers={slaTiers}
          contracts={contracts}
          pendingContracts={pendingContracts}
        />

        <OverviewCard
          styles={styles}
          api={api}
          apiAsset={apiAsset}
          governanceReport={governanceReport}
        />

        <AppliedPoliciesCard
          styles={styles}
          policies={policies}
          policyRemoveBusyId={policyRemoveBusyId}
          onRemovePolicy={handleRemovePolicy}
        />

        <PolicyCatalogCard
          styles={styles}
          templates={mergedPolicyTemplates}
          appliedPolicyKeys={appliedPolicyKeys}
          policyApplyBusyId={policyApplyBusyId}
          onConfigure={handleOpenPolicyDialog}
          onOpenDocs={openDocs}
        />

        <SLATiersCard
          styles={styles}
          slaTiers={slaTiers}
          tierDeleteBusyId={tierDeleteBusyId}
          onAddTier={openCreateTierDialog}
          onEditTier={openEditTierDialog}
          onDeleteTier={handleDeleteTier}
        />

        <ContractsCard
          styles={styles}
          contracts={contracts}
          contractAction={contractAction}
          onContractAction={handleContractAction}
        />
      </ScrollView>

      <Portal>
        <TierDialog
          styles={styles}
          dialog={tierDialog}
          draft={tierDraft}
          submitting={tierSubmitting}
          onChangeDraft={setTierDraft}
          onDismiss={closeTierDialog}
          onSubmit={handleSubmitTier}
        />

        <PolicyConfigDialog
          styles={styles}
          dialog={policyDialog}
          setDialog={setPolicyDialog}
          onSubmit={handleSubmitConfiguredPolicy}
        />
      </Portal>
    </View>
  );
};

export default APIDetailScreen;

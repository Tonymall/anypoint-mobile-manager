// ============================================================
// API Detail - policy state + actions hook
// ============================================================

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { apiManagerKeys } from '../../../hooks/queries';
import * as apiManagerService from '../../../services/apiManagerService';
import { hapticError, hapticSuccess } from '../../../utils/haptics';
import { type PolicyDialogState } from './types';

interface UsePolicyActionsArgs {
  apiId: number;
  orgId?: string;
  envId?: string;
  nextPolicyOrder: number;
}

export function usePolicyActions({ apiId, orgId, envId, nextPolicyOrder }: UsePolicyActionsArgs) {
  const queryClient = useQueryClient();

  const [policyApplyBusyId, setPolicyApplyBusyId] = useState<string | null>(null);
  const [policyRemoveBusyId, setPolicyRemoveBusyId] = useState<number | null>(null);
  const [policyDialog, setPolicyDialog] = useState<PolicyDialogState>({
    visible: false,
    loading: false,
    submitting: false,
    template: null,
    values: {},
  });

  const applyPolicyWithConfiguration = async (
    template: apiManagerService.APIPolicyTemplate,
    configuration: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!orgId || !envId || !apiId) return false;
    if (!template.groupId || !template.assetId || !template.assetVersion) {
      hapticError();
      return false;
    }

    setPolicyApplyBusyId(template.id);
    try {
      await apiManagerService.applyPolicy(orgId, envId, apiId, {
        policyTemplateId: template.id,
        groupId: template.groupId,
        assetId: template.assetId,
        assetVersion: template.assetVersion,
        configuration,
        order: nextPolicyOrder,
      });
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.policies(orgId, envId, apiId),
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
    if (!orgId || !envId || !apiId) return;
    setPolicyRemoveBusyId(policyId);
    try {
      await apiManagerService.removePolicy(orgId, envId, apiId, policyId);
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.policies(orgId, envId, apiId),
      });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setPolicyRemoveBusyId(null);
    }
  };

  const handleOpenPolicyDialog = async (template: apiManagerService.APIPolicyTemplate) => {
    if (!orgId || !envId || !apiId) return;
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
      const templates = await apiManagerService.getPolicyTemplates(orgId, envId, apiId, {
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

  return {
    policyApplyBusyId,
    policyRemoveBusyId,
    policyDialog,
    setPolicyDialog,
    handleRemovePolicy,
    handleOpenPolicyDialog,
    handleSubmitConfiguredPolicy,
  };
}

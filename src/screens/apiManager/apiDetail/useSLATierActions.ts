// ============================================================
// API Detail - SLA tier state + actions hook
// ============================================================

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { apiManagerKeys } from '../../../hooks/queries';
import * as apiManagerService from '../../../services/apiManagerService';
import type { SLATier } from '../../../types';
import { hapticError, hapticSuccess } from '../../../utils/haptics';
import { type TierDraft, type TierDialogState } from './types';

interface UseSLATierActionsArgs {
  apiId: number;
  orgId?: string;
  envId?: string;
}

export function useSLATierActions({ apiId, orgId, envId }: UseSLATierActionsArgs) {
  const queryClient = useQueryClient();

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

  const openEditTierDialog = (tier: SLATier) => {
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
    if (!orgId || !envId || !apiId) return;
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
        await apiManagerService.updateSLATier(orgId, envId, apiId, tierDialog.tierId, payload);
      } else {
        await apiManagerService.createSLATier(orgId, envId, apiId, payload);
      }
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.slaTiers(orgId, envId, apiId),
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
    if (!orgId || !envId || !apiId) return;
    setTierDeleteBusyId(tierId);
    try {
      await apiManagerService.deleteSLATier(orgId, envId, apiId, tierId);
      await queryClient.invalidateQueries({
        queryKey: apiManagerKeys.slaTiers(orgId, envId, apiId),
      });
      hapticSuccess();
    } catch {
      hapticError();
    } finally {
      setTierDeleteBusyId(null);
    }
  };

  return {
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
  };
}

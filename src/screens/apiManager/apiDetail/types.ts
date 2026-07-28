// ============================================================
// API Detail - shared local types
// ============================================================

import type * as apiManagerService from '../../../services/apiManagerService';

export type ContractActionState = {
  contractId: number | null;
  action: 'approve' | 'reject' | null;
};

export type TierDraft = {
  name: string;
  description: string;
  maximumRequests: string;
  periodSeconds: string;
  autoApprove: boolean;
  status: 'ACTIVE' | 'DEPRECATED';
};

export type TierDialogState = {
  visible: boolean;
  mode: 'create' | 'edit';
  tierId: number | null;
};

export type PolicyDialogState = {
  visible: boolean;
  loading: boolean;
  submitting: boolean;
  template: apiManagerService.APIPolicyTemplate | null;
  values: Record<string, string | boolean>;
};

import { useQuery } from '@tanstack/react-query';
import * as auditLogService from '../../services/auditLogService';
import { useAuthStore } from '../../stores/authStore';
import type { AuditLogQueryParams } from '../../services/auditLogService';

export const auditLogKeys = {
  all: ['auditLogs'] as const,
  query: (orgId: string, params?: AuditLogQueryParams) =>
    [...auditLogKeys.all, orgId, params] as const,
};

export function useAuditLogs(params?: AuditLogQueryParams) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: auditLogKeys.query(orgId ?? '', params),
    queryFn: () => auditLogService.queryAuditLogs(orgId!, params),
    enabled: !!orgId && isAuthenticated,
  });
}

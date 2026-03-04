import { useQuery } from '@tanstack/react-query';
import * as environmentService from '../../services/environmentService';

export const environmentKeys = {
  all: ['environments'] as const,
  byOrg: (orgId: string) => [...environmentKeys.all, orgId] as const,
};

export function useEnvironments(organizationId: string | undefined) {
  return useQuery({
    queryKey: environmentKeys.byOrg(organizationId ?? ''),
    queryFn: () => environmentService.getEnvironments(organizationId!),
    enabled: !!organizationId,
  });
}

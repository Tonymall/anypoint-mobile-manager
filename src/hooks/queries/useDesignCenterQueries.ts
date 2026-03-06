import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as designCenterService from '../../services/designCenterService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory -- scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(domain: string): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return [domain, currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const designCenterKeys = {
  all: () => scopePrefix('designCenter'),
  projects: () => [...scopePrefix('designCenter'), 'projects'] as const,
  project: (id: string) => [...scopePrefix('designCenter'), 'project', id] as const,
};

// ---------- Queries ----------

export function useProjects(params?: Parameters<typeof designCenterService.getProjects>[1]) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: [...designCenterKeys.projects(), params],
    queryFn: () => designCenterService.getProjects(orgId!, params),
    enabled: !!orgId && !!envId,
  });
}

export function useProject(id: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: designCenterKeys.project(id),
    queryFn: () => designCenterService.getProject(id),
    enabled: !!orgId && !!envId && !!id,
  });
}

// ---------- Mutations ----------

export function useCreateProject() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);

  return useMutation({
    mutationFn: (variables: { ownerId: string; project: { name: string; classifier: string } }) =>
      designCenterService.createProject(orgId!, variables.ownerId, variables.project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: designCenterKeys.projects() });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => designCenterService.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: designCenterKeys.projects() });
    },
  });
}

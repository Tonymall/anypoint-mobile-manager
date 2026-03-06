import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as accessService from '../../services/accessService';
import { getBusinessGroups } from '../../services/authService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory -- scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(domain: string): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return [domain, currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const accessKeys = {
  all: () => scopePrefix('access'),
  users: (params?: Parameters<typeof accessService.getUsers>[1]) =>
    [...scopePrefix('access'), 'users', JSON.stringify(params)] as const,
  teams: (params?: Parameters<typeof accessService.getTeams>[1]) =>
    [...scopePrefix('access'), 'teams', JSON.stringify(params)] as const,
  connectedApps: () => [...scopePrefix('access'), 'connectedApps'] as const,
  permissions: () => [...scopePrefix('access'), 'permissions'] as const,
  businessGroups: () => [...scopePrefix('access'), 'businessGroups'] as const,
};

// ---------- Queries ----------

export function useUsers(params?: Parameters<typeof accessService.getUsers>[1]) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: accessKeys.users(params),
    queryFn: () => accessService.getUsers(orgId!, params),
    enabled: !!orgId && !!envId,
  });
}

export function useTeams(params?: Parameters<typeof accessService.getTeams>[1]) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: accessKeys.teams(params),
    queryFn: () => accessService.getTeams(orgId!, params),
    enabled: !!orgId && !!envId,
    retry: false,
  });
}

export function useConnectedApps() {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: accessKeys.connectedApps(),
    queryFn: () => accessService.getConnectedApps(orgId!),
    enabled: !!orgId && !!envId,
  });
}

export function usePermissions() {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: accessKeys.permissions(),
    queryFn: () => accessService.getPermissions(orgId!),
    enabled: !!orgId && !!envId,
  });
}

export function useBusinessGroups() {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: accessKeys.businessGroups(),
    queryFn: () => getBusinessGroups(orgId!),
    enabled: !!orgId && !!envId,
  });
}

// ---------- Mutations ----------

export function useInviteUser() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);

  return useMutation({
    mutationFn: (invitation: Parameters<typeof accessService.inviteUser>[1]) =>
      accessService.inviteUser(orgId!, invitation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessKeys.users() });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);

  return useMutation({
    mutationFn: (userId: string) => accessService.deactivateUser(orgId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessKeys.users() });
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);

  return useMutation({
    mutationFn: (team: Parameters<typeof accessService.createTeam>[1]) =>
      accessService.createTeam(orgId!, team),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessKeys.teams() });
    },
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);

  return useMutation({
    mutationFn: (assignment: Parameters<typeof accessService.assignRole>[1]) =>
      accessService.assignRole(orgId!, assignment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessKeys.users() });
      queryClient.invalidateQueries({ queryKey: accessKeys.teams() });
      queryClient.invalidateQueries({ queryKey: accessKeys.permissions() });
    },
  });
}

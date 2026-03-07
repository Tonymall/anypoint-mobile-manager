import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as secretManagerService from '../../services/secretManagerService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory -- scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(domain: string): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return [domain, currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const secretKeys = {
  all: () => scopePrefix('secrets'),
  groups: () => [...scopePrefix('secrets'), 'groups'] as const,
  group: (id: string) => [...scopePrefix('secrets'), 'group', id] as const,
  keystores: (groupId: string) => [...scopePrefix('secrets'), 'keystores', groupId] as const,
  certificates: (groupId: string) => [...scopePrefix('secrets'), 'certificates', groupId] as const,
  truststores: (groupId: string) => [...scopePrefix('secrets'), 'truststores', groupId] as const,
  tlsContexts: (groupId: string) => [...scopePrefix('secrets'), 'tlsContexts', groupId] as const,
};

// ---------- Queries ----------

export function useSecretGroups() {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: secretKeys.groups(),
    queryFn: () => secretManagerService.getSecretGroups(orgId!, envId!),
    enabled: !!orgId && !!envId,
  });
}

export function useSecretGroup(groupId: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: secretKeys.group(groupId),
    queryFn: () => secretManagerService.getSecretGroup(orgId!, envId!, groupId),
    enabled: !!orgId && !!envId && !!groupId,
  });
}

export function useKeystores(groupId: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: secretKeys.keystores(groupId),
    queryFn: () => secretManagerService.getKeystores(orgId!, envId!, groupId),
    enabled: !!orgId && !!envId && !!groupId,
  });
}

export function useCertificates(groupId: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: secretKeys.certificates(groupId),
    queryFn: () => secretManagerService.getCertificates(orgId!, envId!, groupId),
    enabled: !!orgId && !!envId && !!groupId,
  });
}

export function useTruststores(groupId: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: secretKeys.truststores(groupId),
    queryFn: () => secretManagerService.getTruststores(orgId!, envId!, groupId),
    enabled: !!orgId && !!envId && !!groupId,
  });
}

export function useTlsContexts(groupId: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: secretKeys.tlsContexts(groupId),
    queryFn: () => secretManagerService.getTlsContexts(orgId!, envId!, groupId),
    enabled: !!orgId && !!envId && !!groupId,
  });
}

// ---------- Mutations ----------

export function useCreateSecretGroup() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (body: { name: string; downloadable: boolean }) =>
      secretManagerService.createSecretGroup(orgId!, envId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretKeys.groups() });
    },
  });
}

export function useDeleteSecretGroup() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (groupId: string) =>
      secretManagerService.deleteSecretGroup(orgId!, envId!, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretKeys.all() });
    },
  });
}

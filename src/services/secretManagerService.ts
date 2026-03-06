import api from './api';
import type { SecretGroup, Keystore, Certificate, Truststore, TlsContext } from '../types';

const SM_BASE = '/secrets-manager/api/v1';

function buildPath(orgId: string, envId: string) {
  return `${SM_BASE}/organizations/${orgId}/environments/${envId}`;
}

export async function getSecretGroups(orgId: string, envId: string): Promise<SecretGroup[]> {
  const { data } = await api.get<SecretGroup[]>(`${buildPath(orgId, envId)}/secretGroups`);
  return data;
}

export async function getSecretGroup(orgId: string, envId: string, groupId: string): Promise<SecretGroup> {
  const { data } = await api.get<SecretGroup>(`${buildPath(orgId, envId)}/secretGroups/${groupId}`);
  return data;
}

export async function getKeystores(orgId: string, envId: string, groupId: string): Promise<Keystore[]> {
  const { data } = await api.get<Keystore[]>(`${buildPath(orgId, envId)}/secretGroups/${groupId}/keystores`);
  return data;
}

export async function getCertificates(orgId: string, envId: string, groupId: string): Promise<Certificate[]> {
  const { data } = await api.get<Certificate[]>(`${buildPath(orgId, envId)}/secretGroups/${groupId}/certificates`);
  return data;
}

export async function getTruststores(orgId: string, envId: string, groupId: string): Promise<Truststore[]> {
  const { data } = await api.get<Truststore[]>(`${buildPath(orgId, envId)}/secretGroups/${groupId}/truststores`);
  return data;
}

export async function getTlsContexts(orgId: string, envId: string, groupId: string): Promise<TlsContext[]> {
  const { data } = await api.get<TlsContext[]>(`${buildPath(orgId, envId)}/secretGroups/${groupId}/tlsContexts`);
  return data;
}

export async function createSecretGroup(
  orgId: string,
  envId: string,
  body: { name: string; downloadable: boolean },
): Promise<SecretGroup> {
  const { data } = await api.post<SecretGroup>(`${buildPath(orgId, envId)}/secretGroups`, body);
  return data;
}

export async function deleteSecretGroup(orgId: string, envId: string, groupId: string): Promise<void> {
  await api.delete(`${buildPath(orgId, envId)}/secretGroups/${groupId}?force=true`);
}

import api from './api';
import { toNumber, toStringValue, unwrapCollection, withOptionalFallback } from './controlPlaneCommon';

const CLOUDHUB_ORG_BASE = '/cloudhub/api/organizations';

export interface CloudHubVpc {
  id: string;
  name: string;
  region: string | null;
  cidr: string | null;
  status: string | null;
}

export interface CloudHubLoadBalancer {
  id: string;
  name: string;
  region: string | null;
  status: string | null;
  instanceCount: number | null;
}

export interface CloudHubTransitGateway {
  id: string;
  name: string;
  region: string | null;
  status: string | null;
}

export interface CloudHubIpSecTunnel {
  id: string;
  name: string;
  status: string | null;
  remoteAddress: string | null;
  vpcId: string | null;
}

function asRecord(value: unknown): Record<string, any> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, any>;
}

function normalizeVpc(raw: unknown): CloudHubVpc {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.vpcId) ?? toStringValue(item.name) ?? `vpc-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.displayName) ?? 'Unnamed VPC',
    region: toStringValue(item.region) ?? toStringValue(item.workerCloud),
    cidr: toStringValue(item.cidr) ?? toStringValue(item.cidrBlock),
    status: toStringValue(item.status) ?? toStringValue(item.state),
  };
}

function normalizeLoadBalancer(raw: unknown): CloudHubLoadBalancer {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.loadBalancerId) ?? toStringValue(item.name) ?? `lb-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.displayName) ?? 'Unnamed load balancer',
    region: toStringValue(item.region) ?? toStringValue(item.workerCloud),
    status: toStringValue(item.status) ?? toStringValue(item.state),
    instanceCount: toNumber(item.instanceCount) ?? toNumber(item.replicaCount),
  };
}

function normalizeTransitGateway(raw: unknown): CloudHubTransitGateway {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.gatewayId) ?? toStringValue(item.name) ?? `tgw-${Math.random()}`,
    name: toStringValue(item.name) ?? 'Transit gateway',
    region: toStringValue(item.region) ?? toStringValue(item.workerCloud),
    status: toStringValue(item.status) ?? toStringValue(item.state),
  };
}

function normalizeTunnel(raw: unknown, vpcId: string | null = null): CloudHubIpSecTunnel {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.tunnelId) ?? toStringValue(item.name) ?? `tunnel-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.displayName) ?? 'IPsec tunnel',
    status: toStringValue(item.status) ?? toStringValue(item.state),
    remoteAddress: toStringValue(item.remoteAddress) ?? toStringValue(item.remoteIp),
    vpcId,
  };
}

export async function getVpcs(organizationId: string): Promise<CloudHubVpc[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${CLOUDHUB_ORG_BASE}/${organizationId}/vpcs`);
    return unwrapCollection(data, ['vpcs']).map(normalizeVpc);
  }, []);
}

export async function getLoadBalancers(organizationId: string): Promise<CloudHubLoadBalancer[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${CLOUDHUB_ORG_BASE}/${organizationId}/loadbalancers`);
    return unwrapCollection(data, ['loadBalancers', 'items']).map(normalizeLoadBalancer);
  }, []);
}

export async function getTransitGateways(organizationId: string): Promise<CloudHubTransitGateway[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${CLOUDHUB_ORG_BASE}/${organizationId}/tgws`);
    return unwrapCollection(data, ['gateways', 'tgws', 'items']).map(normalizeTransitGateway);
  }, []);
}

export async function getLegacyIpSecTunnels(organizationId: string): Promise<CloudHubIpSecTunnel[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${CLOUDHUB_ORG_BASE}/${organizationId}/legacyipsec`);
    return unwrapCollection(data, ['tunnels', 'connections', 'items']).map((entry) => normalizeTunnel(entry));
  }, []);
}

export async function getVpcIpSecTunnels(
  organizationId: string,
  vpcId: string,
): Promise<CloudHubIpSecTunnel[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${CLOUDHUB_ORG_BASE}/${organizationId}/vpcs/${vpcId}/ipsec`);
    return unwrapCollection(data, ['tunnels', 'connections', 'items']).map((entry) => normalizeTunnel(entry, vpcId));
  }, []);
}

// ============================================================
// Anypoint Mobile Platform - Type Definitions
// ============================================================

// --- Authentication & User ---
export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  organizationName: string;
  roles: UserRole[];
  memberOfOrganizations: Organization[];
}

export interface UserRole {
  roleId: string;
  name: string;
  description: string;
  environmentId?: string;
  environmentName?: string;
}

export interface Organization {
  id: string;
  name: string;
  parentId?: string;
  subOrganizations?: Organization[];
  entitlements?: Record<string, unknown>;
}

export interface BusinessGroup {
  id: string;
  name: string;
  parentId: string;
  ownerName: string;
  entitlements: Record<string, unknown>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SSOConfig {
  provider: 'okta' | 'azure_ad' | 'saml' | 'openid';
  clientId: string;
  authorizationUrl: string;
  redirectUri: string;
}

// --- Environment ---
export interface Environment {
  id: string;
  name: string;
  organizationId: string;
  type: 'sandbox' | 'production' | 'design';
  isProduction: boolean;
  clientId: string;
}

// --- Applications (Runtime Manager) ---
export type AppStatus = 'STARTED' | 'STOPPED' | 'FAILED' | 'DEPLOYING' | 'UNDEPLOYING' | 'PARTIALLY_STARTED';
export type DeploymentTarget = 'cloudhub' | 'rtf' | 'hybrid' | 'cloudhub2';

export interface Application {
  id: string;
  name: string;
  domain: string;
  status: AppStatus;
  deploymentTarget: DeploymentTarget;
  lastUpdateTime: string;
  fileName: string;
  muleVersion: string;
  region: string;
  workers: WorkerConfig;
  monitoring: AppMonitoring;
  staticIPs?: string[];
  properties?: Record<string, string>;
  persistentQueues: boolean;
  loggingEnabled: boolean;
}

export interface WorkerConfig {
  type: WorkerSize;
  amount: number;
  remainingOrgWorkers: number;
}

export interface WorkerSize {
  name: string;
  weight: number;
  cpu: string;
  memory: string;
}

export interface AppMonitoring {
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  threadCount: number;
}

export interface AppLogEntry {
  timestamp: string;
  priority: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  threadName?: string;
  loggerName?: string;
}

export interface DeploymentRequest {
  applicationName: string;
  targetId: string;
  targetType: DeploymentTarget;
  artifactId: string;
  version: string;
  workerType?: string;
  workerCount?: number;
  properties?: Record<string, string>;
}

// --- API Manager ---
export type APIStatus = 'active' | 'inactive' | 'deprecated' | 'blocked';

export interface ManagedAPI {
  id: number;
  instanceLabel: string;
  assetId: string;
  assetVersion: string;
  productVersion: string;
  environmentId: string;
  technology: string;
  endpointUri?: string;
  status: APIStatus;
  autodiscoveryInstanceName?: string;
  policies: APIPolicy[];
  slaTiers: SLATier[];
  alerts: APIAlert[];
  contracts: APIContract[];
}

export interface APIPolicy {
  id: number;
  policyTemplateId: string;
  groupId: string;
  assetId: string;
  assetVersion: string;
  configuration: Record<string, unknown>;
  order: number;
  disabled: boolean;
  pointcutData?: unknown;
}

export type PolicyTemplate = {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'compliance' | 'quality_of_service' | 'transformation' | 'troubleshooting';
  supportedJdkVersions: string[];
  requiredCharacteristics: string[];
  providedCharacteristics: string[];
  configuration: PolicyConfigField[];
};

export interface PolicyConfigField {
  propertyName: string;
  name: string;
  description: string;
  type: 'string' | 'int' | 'boolean' | 'array' | 'expression';
  defaultValue?: unknown;
  optional: boolean;
  sensitive: boolean;
  allowMultiple: boolean;
}

export interface SLATier {
  id: number;
  name: string;
  description: string;
  status: 'ACTIVE' | 'DEPRECATED';
  autoApprove: boolean;
  limits: SLALimit[];
}

export interface SLALimit {
  maximumRequests: number;
  timePeriodInMilliseconds: number;
  visible: boolean;
}

export interface APIContract {
  id: number;
  applicationName: string;
  applicationId: number;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'REVOKED';
  tierId: number;
  tierName: string;
  requestedDate: string;
  approvedDate?: string;
}

export interface APIAlert {
  id: number;
  name: string;
  type: AlertType;
  enabled: boolean;
  severity: AlertSeverity;
  condition: AlertCondition;
  recipients: string[];
}

// --- Monitoring ---
export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

export interface MetricSeries {
  name: string;
  data: MetricDataPoint[];
  unit: string;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  panels: DashboardPanel[];
  timeRange: TimeRange;
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'line' | 'bar' | 'area' | 'gauge' | 'stat' | 'table';
  metrics: string[];
  position: { x: number; y: number; w: number; h: number };
}

export interface TimeRange {
  from: string;
  to: string;
  label: string;
}

export interface LogSearchQuery {
  query: string;
  from: string;
  to: string;
  priority?: string;
  applicationName?: string;
  limit: number;
  offset: number;
}

export interface TransactionTrace {
  traceId: string;
  spans: TraceSpan[];
  duration: number;
  startTime: string;
  status: 'success' | 'error';
  applicationName: string;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  duration: number;
  startTime: number;
  status: 'success' | 'error';
  tags: Record<string, string>;
}

export interface JVMMetrics {
  heapUsed: number;
  heapMax: number;
  nonHeapUsed: number;
  gcCollections: number;
  gcTime: number;
  threadCount: number;
  threadPeak: number;
  classesLoaded: number;
  uptime: number;
}

// --- Alerts ---
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
export type AlertType =
  | 'response-time'
  | 'error-count'
  | 'request-count'
  | 'cpu-usage'
  | 'memory-usage'
  | 'worker-unresponsive'
  | 'deployment-failed'
  | 'custom';

export interface Alert {
  id: string;
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  source: string;
  applicationName?: string;
  apiName?: string;
  environmentId: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  periodMinutes: number;
  consecutivePoints: number;
}

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  enabled: boolean;
  condition: AlertCondition;
  recipients: AlertRecipient[];
  applicationIds?: string[];
  apiIds?: number[];
}

export interface AlertRecipient {
  type: 'email' | 'push' | 'slack' | 'pagerduty';
  value: string;
}

// --- Exchange ---
export type AssetType = 'rest-api' | 'soap-api' | 'http-api' | 'raml-fragment' | 'connector' | 'template' | 'example' | 'policy' | 'custom';
export type AssetVisibility = 'public' | 'private' | 'organization';

export interface ExchangeAsset {
  groupId: string;
  assetId: string;
  name: string;
  description: string;
  type: AssetType;
  version: string;
  versionGroup: string;
  status: 'published' | 'deprecated';
  visibility: AssetVisibility;
  rating: number;
  numberOfRatings: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  categories: AssetCategory[];
  tags: string[];
  icon?: string;
  files: AssetFile[];
  documentation: AssetDocPage[];
}

export interface AssetCategory {
  key: string;
  value: string;
  displayName: string;
}

export interface AssetFile {
  classifier: string;
  packaging: string;
  downloadUrl: string;
  md5: string;
  sha1: string;
  createdAt: string;
}

export interface AssetDocPage {
  title: string;
  content: string;
  url: string;
  order: number;
}

// --- Servers & Infrastructure ---
export type ServerStatus = 'RUNNING' | 'DISCONNECTED' | 'CREATED' | 'UPDATED';
export type ServerType = 'SERVER' | 'SERVER_GROUP' | 'CLUSTER';

export interface Server {
  id: number;
  name: string;
  type: ServerType;
  status: ServerStatus;
  muleVersion: string;
  agentVersion: string;
  addresses: ServerAddress[];
  runtimeInformation: ServerRuntimeInfo;
  lastConnected: string;
  applications: string[];
}

export interface ServerAddress {
  ip: string;
  networkInterface: string;
}

export interface ServerRuntimeInfo {
  javaVersion: string;
  osName: string;
  osVersion: string;
  processors: number;
  memoryTotal: number;
  memoryFree: number;
  diskTotal: number;
  diskFree: number;
  cpuUsage: number;
}

export interface ServerGroup {
  id: number;
  name: string;
  serverIds: number[];
  status: ServerStatus;
}

export interface Cluster {
  id: number;
  name: string;
  serverIds: number[];
  status: ServerStatus;
  multicastEnabled: boolean;
  primaryNode: number;
}

export interface RTFDeployment {
  id: string;
  name: string;
  status: string;
  target: string;
  replicas: number;
  cpuAllocated: string;
  memoryAllocated: string;
  lastModified: string;
}

// --- Connectors ---
export interface Connector {
  groupId: string;
  artifactId: string;
  name: string;
  version: string;
  description: string;
  category: string;
  icon?: string;
  documentation: string;
  supportLevel: 'premium' | 'select' | 'community';
  usedInApps: string[];
}

// --- Governance ---
export interface GovernanceProfile {
  id: string;
  name: string;
  description: string;
  rulesets: GovernanceRuleset[];
  status: 'active' | 'draft' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceRuleset {
  id: string;
  name: string;
  description: string;
  rules: GovernanceRule[];
  category: string;
}

export interface GovernanceRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
}

export interface ConformanceReport {
  apiId: string;
  apiName: string;
  profileId: string;
  profileName: string;
  status: 'conformant' | 'non-conformant' | 'not-validated';
  violations: GovernanceViolation[];
  validatedAt: string;
}

export interface GovernanceViolation {
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location: string;
  suggestion?: string;
}

// --- Access Management ---
export interface Team {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  roles: UserRole[];
  parentTeamId?: string;
}

export interface ConnectedApp {
  id: string;
  name: string;
  clientId: string;
  grantTypes: string[];
  redirectUris: string[];
  scopes: string[];
  enabled: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  userName: string;
  userId: string;
  timestamp: string;
  environmentId?: string;
  environmentName?: string;
  payload?: Record<string, unknown>;
}

// --- Deployment ---
export type DeploymentStatus = 'DEPLOYING' | 'DEPLOYED' | 'FAILED' | 'UNDEPLOYING' | 'PARTIALLY_DEPLOYED';

export interface DeploymentHistory {
  id: string;
  applicationName: string;
  version: string;
  status: DeploymentStatus;
  target: string;
  targetType: DeploymentTarget;
  startedAt: string;
  completedAt?: string;
  initiatedBy: string;
  buildNumber?: string;
}

// --- Analytics ---
export interface APIAnalytics {
  apiId: number;
  apiName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p50Latency: number;
  p90Latency: number;
  p99Latency: number;
  requestsByStatus: Record<string, number>;
  topConsumers: ConsumerStats[];
  requestsByGeo: GeoStats[];
}

export interface ConsumerStats {
  applicationName: string;
  applicationId: string;
  totalRequests: number;
  errorRate: number;
}

export interface GeoStats {
  country: string;
  region: string;
  requests: number;
  averageLatency: number;
}

// --- Security ---
export interface SecurityPolicy {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive';
  configuration: Record<string, unknown>;
  appliedTo: string[];
}

export interface TLSCertificate {
  id: string;
  name: string;
  domain: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  status: 'valid' | 'expiring_soon' | 'expired';
  fingerprint: string;
}

export interface Secret {
  id: string;
  name: string;
  type: 'shared-secret' | 'certificate' | 'key-store' | 'trust-store';
  group: string;
  expiresAt?: string;
  lastRotated: string;
  createdAt: string;
}

// --- Anypoint MQ ---
export interface MQQueue {
  queueId: string;
  name: string;
  type: 'standard' | 'fifo';
  encrypted: boolean;
  defaultTtl: number;
  defaultLockTtl: number;
  deadLetterQueueId?: string;
  maxDeliveries: number;
  messagesInFlight: number;
  messagesVisible: number;
  totalMessages: number;
}

export interface MQExchange {
  exchangeId: string;
  name: string;
  encrypted: boolean;
  boundQueues: string[];
}

export interface MQMessage {
  messageId: string;
  body: string;
  headers: Record<string, string>;
  properties: Record<string, string>;
  createdAt: string;
  deliveryCount: number;
}

// --- B2B ---
export interface B2BPartner {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'onboarding';
  identifiers: PartnerIdentifier[];
  protocols: string[];
  documentsProcessed: number;
  lastTransactionDate: string;
}

export interface PartnerIdentifier {
  type: 'DUNS' | 'AS2' | 'X12-ISA' | 'X12-GS';
  value: string;
  qualifier?: string;
}

export interface B2BTransaction {
  id: string;
  partnerId: string;
  partnerName: string;
  direction: 'inbound' | 'outbound';
  documentType: string;
  status: 'success' | 'error' | 'pending' | 'rejected';
  timestamp: string;
  errorMessage?: string;
}

// --- Settings ---
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  biometricEnabled: boolean;
  defaultEnvironmentId?: string;
  defaultOrganizationId?: string;
  pushNotificationsEnabled: boolean;
  notificationPreferences: NotificationPreferences;
  pollingIntervalSeconds: number;
}

export interface NotificationPreferences {
  criticalAlerts: boolean;
  warningAlerts: boolean;
  infoAlerts: boolean;
  deploymentUpdates: boolean;
  apiAccessRequests: boolean;
  securityEvents: boolean;
}

// --- Common ---
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  details?: unknown;
}

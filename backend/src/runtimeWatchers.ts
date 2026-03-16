import { recordAlertEvent } from './storage/alertEvents';
import { sendPushNotificationToUser } from './push';

type LifecycleAction = 'start' | 'stop' | 'restart';

interface LifecycleWatchRequest {
  userId: string;
  domain: string;
  action: LifecycleAction;
  accessToken: string;
  baseUrl: string;
  organizationId: string;
  environmentId: string;
  controlPlane: string;
}

interface WatchHandle {
  key: string;
  stop: () => void;
}

const FINAL_SUCCESS_BY_ACTION: Record<LifecycleAction, Set<string>> = {
  start: new Set(['STARTED', 'Started', 'started', 'RUNNING', 'Running', 'running']),
  restart: new Set(['STARTED', 'Started', 'started', 'RUNNING', 'Running', 'running']),
  stop: new Set(['STOPPED', 'Stopped', 'stopped', 'UNDEPLOYED', 'Undeployed', 'undeployed', 'NOT_RUNNING']),
};

const FINAL_FAILURE_STATUSES = new Set(['DEPLOY_FAILED', 'FAILED', 'Failed', 'failed']);
const ACTIVE_WATCHES = new Map<string, WatchHandle>();
const POLL_INTERVAL_MS = 15_000;
const WATCH_TIMEOUT_MS = 20 * 60_000;

function watchKey(request: LifecycleWatchRequest): string {
  return [request.userId, request.domain, request.action].join(':');
}

function buildFinalNotification(
  action: LifecycleAction,
  domain: string,
  status: string,
): { type: 'deployment'; action: 'status_change'; title: string; body: string } {
  if (FINAL_FAILURE_STATUSES.has(status)) {
    return {
      type: 'deployment',
      action: 'status_change',
      title: 'Deployment Failed',
      body: `${domain} - deployment failed`,
    };
  }

  if (action === 'stop') {
    return {
      type: 'deployment',
      action: 'status_change',
      title: 'Application Stopped',
      body: `${domain} - application stopped`,
    };
  }

  return {
    type: 'deployment',
    action: 'status_change',
    title: 'Application Deployed',
    body: `${domain} - application deployed`,
  };
}

function matchesDeployment(dep: any, domain: string): boolean {
  if (!dep || typeof dep !== 'object') {
    return false;
  }

  return (
    dep.name === domain ||
    dep.id === domain ||
    dep.fullDomain === domain ||
    dep.application?.name === domain ||
    dep.application?.fullDomain === domain ||
    dep.application?.ref?.artifactId === domain
  );
}

async function fetchStatus(request: LifecycleWatchRequest): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${request.accessToken}`,
    Accept: 'application/json',
    'X-ANYPNT-ORG-ID': request.organizationId,
    'X-ANYPNT-ENV-ID': request.environmentId,
  };

  const ch1Candidates = [
    `${request.baseUrl}/cloudhub/api/v2/applications/${encodeURIComponent(request.domain)}`,
    `${request.baseUrl}/cloudhub/api/applications/${encodeURIComponent(request.domain)}`,
  ];

  for (const url of ch1Candidates) {
    const response = await fetch(url, { headers });
    if (response.ok) {
      const data = await response.json() as { status?: string };
      if (typeof data.status === 'string' && data.status) {
        return data.status;
      }
    } else if (response.status === 401) {
      throw new Error('Lifecycle watch unauthorized');
    }
  }

  const amcUrl = `${request.baseUrl}/amc/application-manager/api/v2/organizations/${encodeURIComponent(request.organizationId)}/environments/${encodeURIComponent(request.environmentId)}/deployments`;
  const amcResponse = await fetch(amcUrl, { headers });
  if (amcResponse.ok) {
    const data = await amcResponse.json() as any;
    const items = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
    const match = items.find((item: any) => matchesDeployment(item, request.domain));
    const status = match?.application?.status ?? match?.status ?? null;
    return typeof status === 'string' ? status : null;
  }

  if (amcResponse.status === 401) {
    throw new Error('Lifecycle watch unauthorized');
  }

  return null;
}

async function finalizeWatch(request: LifecycleWatchRequest, status: string): Promise<void> {
  const notification = buildFinalNotification(request.action, request.domain, status);
  const recorded = await recordAlertEvent({
    userId: request.userId,
    type: notification.type,
    action: notification.action,
    title: notification.title,
    body: notification.body,
    applicationName: request.domain,
    domain: request.domain,
    environmentId: request.environmentId,
    organizationId: request.organizationId,
    controlPlane: request.controlPlane,
  });

  if (!recorded.deduped) {
    await sendPushNotificationToUser(request.userId, {
      title: notification.title,
      body: notification.body,
      data: {
        domain: request.domain,
        status,
        action: request.action,
        environmentId: request.environmentId,
        organizationId: request.organizationId,
      },
    });
  }
}

export function queueLifecycleWatch(request: LifecycleWatchRequest): void {
  const key = watchKey(request);
  ACTIVE_WATCHES.get(key)?.stop();

  let intervalId: NodeJS.Timeout | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  let finished = false;

  const stop = () => {
    if (intervalId) clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);
    ACTIVE_WATCHES.delete(key);
  };

  const poll = async () => {
    if (finished) {
      return;
    }

    try {
      const status = await fetchStatus(request);
      if (!status) {
        return;
      }

      if (FINAL_FAILURE_STATUSES.has(status) || FINAL_SUCCESS_BY_ACTION[request.action].has(status)) {
        finished = true;
        await finalizeWatch(request, status);
        stop();
      }
    } catch (error) {
      process.stdout.write(`[runtime-watch] ${request.domain} ${request.action} failed: ${(error as Error)?.message}\n`);
      finished = true;
      stop();
    }
  };

  intervalId = setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);

  timeoutId = setTimeout(() => {
    finished = true;
    stop();
  }, WATCH_TIMEOUT_MS);

  ACTIVE_WATCHES.set(key, { key, stop });
  void poll();
}

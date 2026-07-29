import {
  CRITICAL_ERROR_RATE,
  MIN_TRAFFIC_FOR_ERROR_RATE,
  RECENT_CHANGE_MS,
  STALE_CHANGE_MS,
  deriveIncidents,
  incidentsFromAlerts,
  incidentsFromApplications,
  incidentsFromEstateHealth,
  summarizeIncidents,
} from '../services/incidentFeed';
import type { Alert, InsightsEntityHealth } from '../types';

function entity(over: Partial<InsightsEntityHealth>): InsightsEntityHealth {
  return {
    id: 'e1',
    type: 'app',
    name: 'payments-api',
    orgId: null,
    orgName: null,
    envId: null,
    envName: null,
    p99RequestLatency: null,
    requestVolume: 1000,
    deploymentType: null,
    deploymentId: null,
    errorCount: 0,
    errorRate: 0,
    ...over,
  };
}

function alert(over: Partial<Alert>): Alert {
  return {
    id: 'a1',
    name: 'CPU high',
    type: 'CPU' as Alert['type'],
    severity: 'WARNING' as Alert['severity'],
    status: 'ACTIVE' as Alert['status'],
    message: 'CPU above 80%',
    source: 'cloudhub',
    environmentId: 'env',
    createdAt: '2026-07-28T10:00:00Z',
    updatedAt: '2026-07-28T10:00:00Z',
    ...over,
  };
}

const NOW = 1_800_000_000_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('incidentsFromApplications', () => {
  it('reports a failed deploy as critical however old it is', () => {
    const [incident] = incidentsFromApplications(
      [{ domain: 'a', status: 'FAILED', lastUpdateTime: ago(STALE_CHANGE_MS * 4) }],
      NOW,
    );

    expect(incident.severity).toBe('critical');
    expect(incident.detail).toBe('Application failed to deploy');
  });

  it('reports a recent undeploy as a warning, not critical', () => {
    const [incident] = incidentsFromApplications(
      [{ domain: 'a', status: 'UNDEPLOYED', lastUpdateTime: ago(60_000) }],
      NOW,
    );

    expect(incident.severity).toBe('warning');
    expect(incident.detail).toBe('Application is undeployed');
  });

  it('demotes a deliberate stop to info once it is no longer fresh', () => {
    const [incident] = incidentsFromApplications(
      [{ domain: 'a', status: 'STOPPED', lastUpdateTime: ago(RECENT_CHANGE_MS * 2) }],
      NOW,
    );

    expect(incident.severity).toBe('info');
  });

  it('drops long-parked applications from the feed entirely', () => {
    // The estate always has parked apps; listing them forever buries real work.
    const incidents = incidentsFromApplications(
      [{ domain: 'a', status: 'UNDEPLOYED', lastUpdateTime: ago(STALE_CHANGE_MS + 1) }],
      NOW,
    );

    expect(incidents).toEqual([]);
  });

  it('keeps an idle app without a timestamp rather than hiding it', () => {
    const [incident] = incidentsFromApplications([{ domain: 'a', status: 'STOPPED' }], NOW);

    expect(incident.severity).toBe('warning');
  });

  it('ignores healthy apps', () => {
    expect(incidentsFromApplications([{ domain: 'a', status: 'STARTED' }])).toEqual([]);
  });

  it('tolerates missing and malformed entries', () => {
    expect(incidentsFromApplications([null, undefined, {}] as any)).toEqual([]);
  });

  it('is case-insensitive about status', () => {
    expect(incidentsFromApplications([{ domain: 'a', status: 'failed' }])).toHaveLength(1);
  });

  it('links to the application detail route', () => {
    const [incident] = incidentsFromApplications([{ domain: 'orders', status: 'FAILED' }], NOW);

    expect(incident.route).toBe('/(main)/runtime/[domain]');
    expect(incident.routeParams).toEqual({ domain: 'orders' });
  });
});

describe('incidentsFromAlerts', () => {
  it('skips resolved and dismissed alerts', () => {
    const incidents = incidentsFromAlerts([
      alert({ id: 'a1', status: 'RESOLVED' as Alert['status'] }),
      alert({ id: 'a2', status: 'DISMISSED' as Alert['status'] }),
      alert({ id: 'a3' }),
    ]);

    expect(incidents.map((i) => i.id)).toEqual(['alert:a3']);
  });

  it('maps alert severity onto incident severity', () => {
    const incidents = incidentsFromAlerts([
      alert({ id: 'c', severity: 'CRITICAL' as Alert['severity'] }),
      alert({ id: 'w', severity: 'WARNING' as Alert['severity'] }),
      alert({ id: 'i', severity: 'INFO' as Alert['severity'] }),
    ]);

    expect(incidents.map((i) => i.severity)).toEqual(['critical', 'warning', 'info']);
  });
});

describe('incidentsFromEstateHealth', () => {
  it('ignores entities below the traffic floor', () => {
    const incidents = incidentsFromEstateHealth([
      entity({ requestVolume: MIN_TRAFFIC_FOR_ERROR_RATE - 1, errorRate: 0.5 }),
    ]);

    expect(incidents).toEqual([]);
  });

  it('ignores negligible error rates', () => {
    expect(incidentsFromEstateHealth([entity({ errorRate: 0.001 })])).toEqual([]);
  });

  it('escalates to critical above the critical rate', () => {
    const [incident] = incidentsFromEstateHealth([
      entity({ errorRate: CRITICAL_ERROR_RATE, requestVolume: 500 }),
    ]);

    expect(incident.severity).toBe('critical');
  });

  it('stays a warning below the critical rate', () => {
    const [incident] = incidentsFromEstateHealth([entity({ errorRate: 0.05 })]);

    expect(incident.severity).toBe('warning');
    expect(incident.detail).toContain('5.0%');
  });

  it('falls back to the entity id when the name is missing', () => {
    const [incident] = incidentsFromEstateHealth([
      entity({ name: null, id: 'abc-123', errorRate: 0.2 }),
    ]);

    expect(incident.title).toBe('abc-123');
  });
});

describe('deriveIncidents', () => {
  it('sorts critical before warning before info', () => {
    const incidents = deriveIncidents({
      applications: [{ domain: 'stopped-app', status: 'STOPPED' }],
      alerts: [
        alert({ id: 'crit', severity: 'CRITICAL' as Alert['severity'] }),
        alert({ id: 'info', severity: 'INFO' as Alert['severity'] }),
      ],
      entities: [],
    });

    expect(incidents.map((i) => i.severity)).toEqual(['critical', 'warning', 'info']);
  });

  it('orders newer incidents first within a severity', () => {
    const incidents = deriveIncidents({
      alerts: [
        alert({ id: 'old', createdAt: '2026-07-01T00:00:00Z' }),
        alert({ id: 'new', createdAt: '2026-07-27T00:00:00Z' }),
      ],
    });

    expect(incidents.map((i) => i.id)).toEqual(['alert:new', 'alert:old']);
  });

  it('places incidents without a timestamp after dated ones of equal severity', () => {
    const incidents = deriveIncidents({
      alerts: [alert({ id: 'dated' })],
      entities: [entity({ errorRate: 0.05, requestVolume: 500 })],
    });

    expect(incidents[0].id).toBe('alert:dated');
    expect(incidents[1].source).toBe('insights');
  });

  it('deduplicates repeated ids', () => {
    const incidents = deriveIncidents({
      applications: [
        { domain: 'a', status: 'FAILED' },
        { domain: 'a', status: 'FAILED' },
      ],
    });

    expect(incidents).toHaveLength(1);
  });

  it('returns an empty feed when everything is healthy', () => {
    expect(
      deriveIncidents({
        applications: [{ domain: 'a', status: 'STARTED' }],
        alerts: [],
        entities: [entity({ errorRate: 0 })],
      }),
    ).toEqual([]);
  });

  it('handles all sources being absent', () => {
    expect(deriveIncidents({})).toEqual([]);
  });
});

describe('summarizeIncidents', () => {
  it('counts by severity', () => {
    const incidents = deriveIncidents({
      applications: [
        { domain: 'a', status: 'FAILED' },
        { domain: 'b', status: 'STOPPED' },
      ],
      alerts: [alert({ id: 'i', severity: 'INFO' as Alert['severity'] })],
    });

    expect(summarizeIncidents(incidents)).toEqual({
      critical: 1,
      warning: 1,
      info: 1,
      total: 3,
    });
  });
});

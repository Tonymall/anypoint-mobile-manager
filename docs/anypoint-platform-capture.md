# Anypoint Platform capture — EU1 control plane

Captured 2026-07-28 from a live authenticated session on `eu1.anypoint.mulesoft.com`
(org `Dotcy Developments Ltd`, business group `Dotcy-Hospitality`).

Every path below is relative to the regional control-plane host, matching
`src/config/regions.ts`. Two org ids appear in traffic: the **root org** and the
**business group** — several products scope by one and not the other (noted per section).

## Auth / identity

| Method | Path | Notes |
|---|---|---|
| GET | `/accounts/api/profile` | Called by every product on load |
| POST | `/accounts/api/authorize` | Per-product env/org authorization; fires repeatedly |
| POST | `/accounts/oauth2/token` | Token exchange |
| GET | `/accounts/oauth2/authorize?client_id={product}&response_type=token&redirect_uri=/shared/silentAuthCallback.html` | Silent re-auth; matches the app's silent-auth path |
| GET | `/accounts/api/organizations/{org}/environments` | Environment list |
| GET | `/accounts/api/organizations/{org}/environments/{env}` | Single environment |

## Access Management (root org id)

| Method | Path |
|---|---|
| GET | `/accounts/api/organizations/{org}/users?limit=500&offset=0&includeProfiles=true` |
| GET | `/accounts/api/cs/organizations/{org}/teams?offset=0&limit=500&include_capabilities=true` |
| GET | `/accounts/api/cs/conditionalAssignments?intent=role_assignment` |
| GET | `/accounts/api/v2/cs?hide_managed=true&with_owner_name=false` |
| GET | `/accounts/api/cs/organizations/{org}/identityProviders/names` |
| GET | `/accounts/api/organizations/{org}/identityProviderSettings` |

## Runtime Manager (ARM)

| Method | Path |
|---|---|
| GET | `/armui/api/v2/applications` |
| GET | `/armui/api/v2/servers` |
| GET | `/armui/api/v2/alerts?limit=1000` |
| GET | `/armui/api/v2/users?limit=10000` |
| GET | `/armui/api/v2/permissions` |
| GET | `/hybrid/api/v1/servers/registrationToken` |

**Version drift (resolved):** the app used to target `/armui/api/v1` for servers and
alerts while the console calls **v2**. Whether a given control plane still serves v1
could not be determined from the browser, so `src/services/armApiVersion.ts` now
negotiates: it tries v2 first and falls back to v1 once if a *collection* endpoint
answers 404/405, then pins the result for the session (reset on logout/region change).

## CloudHub

| Method | Path | Notes |
|---|---|---|
| GET | `/cloudhub/api/v2/applications/{domain}` | App detail |
| GET | `/cloudhub/api/v2/applications/{domain}/ch2` | CloudHub 2.0 view of the same app |
| GET | `/cloudhub/api/v2/applications/{domain}/dashboardStats?startDate&endDate&interval` | `interval=900000` (15 min) over a 24h window |
| GET | `/cloudhub/api/v2/applications/{domain}/deployments?orderByDate=DESC&loggingVersion=VERSION_2` | Deployment history |
| GET | `/cloudhub/api/v2/applications/{domain}/deployments/{deploymentId}/logs?limitMsgLen=5000&tail=true` | Log tail |
| GET | `/cloudhub/api/notifications?limit=25&offset=0&status=unread[&domain={domain}]` | Global or per-app |
| GET | `/cloudhub/api/notifications/count?status=unread` | Badge count, polled continuously |
| GET | `/cloudhub/api/mule-versions` | |
| GET | `/cloudhub/api/organizations/{org}/vpcs` | |
| GET | `/cloudhub/api/organizations/{org}/legacyipsec` | |

**Not yet used by the app — instance diagnostics:**

| Method | Path |
|---|---|
| GET | `/cloudhub/api/v2/organizations/{org}/environments/{env}/applications/{domain}/instances/{instanceId}/diagnostics/analysis` |
| GET | `/cloudhub/api/v2/organizations/{org}/environments/{env}/applications/{domain}/instances/diagnostics/analysis-readiness` |

The console fires one pair per historical instance when you open the Logs tab.
Live responses were a mix of `200`, `404` (no analysis for that instance) and
`503` — so any client must treat non-200 as "no diagnosis available", not an error.

Implemented in `src/services/diagnosticsService.ts`, which maps 404 → `none`,
503 → `unavailable`, never throws, and caps the fan-out (5 newest instances,
3 concurrent) instead of the console's one-request-per-instance storm.

## AMC / Runtime Fabric

| Method | Path |
|---|---|
| GET | `/amc/application-manager/api/v2/organizations/{org}/usage/resources` |
| GET | `/runtimefabric/api/organizations/{org}/targets` |
| GET | `/runtimefabric/api/organizations/{org}/privatespaces` |

## API Manager (business-group org id)

| Method | Path |
|---|---|
| GET | `/apimanager/xapi/v1/organizations/{org}/environments?withCloudhubPermissions=true` |
| GET | `/apimanager/xapi/v1/organizations/{org}/environments/{env}/apis?limit=20&offset=0&pinnedFirst=true&sort=name&ascending=false&family=api` |
| GET | `/apimanager/xapi/v1/organizations/{org}/environments/{env}/incompatible-policies` |
| GET | `/apimanager/xapi/v1/organizations/{org}/environments/{env}/policiesVersionCount` |
| GET | `/apimanager/xapi/v1/organizations/{org}/environments/{env}/failed-flex-redeployments` |
| GET | `/gatewaymanager/xapi/v1/organizations/{org}/environments/{env}/permissions` |

The last three are console-only signals the app doesn't surface yet: policy
incompatibilities, per-policy version counts, and failed Flex Gateway redeployments.

## Monitoring (classic — being retired)

| Method | Path |
|---|---|
| GET | `/monitoring/api/sync` |
| GET | `/monitoring/api/visualizer/public/preload.js` |

⚠️ **End of life:** the console banner states built-in dashboards reach EOL on
**15 October 2026**, and the Monitoring *Classic* view retires the same day;
**Anypoint Insights** replaces them.

## Insights / Observability (the replacement)

Clicking Monitoring → Insights leaves the classic app entirely and loads
`/monitoring-new/...`, which talks to a different API:

| Method | Path |
|---|---|
| GET | `/observability/api/v1/metric_types/mulesoft.entity:describe` |
| POST | `/observability/api/v1/metrics:search?offset={n}&limit={n}` |
| GET | `/accounts/api/organizations/{rootOrg}/tenantRelationships` |

`metrics:search` takes a SQL-like AMQL query in the body — `{ "query": "SELECT …" }`.
Captured shapes (all over the `"mulesoft.entity"` metric type, scoped by
`"sub_org.id"` = business group and `"env.id"`, with `timestamp BETWEEN a AND b`):

- **Entity inventory + health** — `LATEST("entity.name"/"entity.type"/"deployment.type")`,
  `PERCENTILE("response_time", 0.99) AS p99RequestLatency`, `COUNT(requests) AS requestVolume`,
  `GROUP BY id ORDER BY requestVolume DESC LIMIT 20`
- **Slowest entities** — same, ordered by `p99RequestLatency DESC LIMIT 60`
- **Error counts** — add `AND "entity.response.status" = 'FAILED'`
- **Time series** — add `timestamp` to the SELECT list and it buckets automatically
- **Scoped to specific entities** — `WHERE "entity.id" IN ('uuid', …)`

Implemented in `src/services/insightsService.ts` (query builders exported and
asserted against these captured strings in `src/__tests__/insightsService.test.ts`).

## Visualizer (root org id)

| Method | Path |
|---|---|
| GET | `/visualizer/api/v4/organizations/{org}/views` |
| GET | `/visualizer/api/v4/organizations/{org}/views/{viewId}/filters` |
| GET / PUT | `/visualizer/api/v4/organizations/{org}/users/{userId}/settings` |
| GET | `/visualizer/api/v4/organizations/{org}/users/{userId}/accessible-organizations` |

## Exchange

| Method | Path |
|---|---|
| POST | `/exchange/api/v2/pseas/stream/_search` |
| GET | `/exchange/api/v2/organizations/{org}/pseas/facets?search=&organizationId=…&classifier=not%3Aagent-network` |
| GET | `/exchange/api/v1/organizations/{org}/queries?limit=6` |
| GET | `/exchange/api/v1/users/me/queries?limit=4` |

`facets` accepts repeated `organizationId` params — one per accessible org.

## API Governance

| Method | Path |
|---|---|
| GET | `/governance/xapi/api/v1/dashboard/{org}?tenant=false` |
| GET | `/governance/xapi/api/v1/overage/limit?organization={org}` |

## Metering / usage

| Method | Path |
|---|---|
| GET | `/metering/usage/api/v1/meters:describe` |
| POST | `/metering/usage/api/v1/meters:search` |

Colon-verb style. `:describe` returns the meter catalog; the console then fires one
`:search` POST per meter/product.

## Secrets Manager

| Method | Path |
|---|---|
| GET | `/secrets-manager/api/v1/supportedStoreTypes` |
| GET | `/secrets-manager/api/v1/organizations/{org}/environments/{env}/secretGroups/` |

## Third-party (ignore)

LaunchDarkly (`app.launchdarkly.com`, `events.launchdarkly.com`) for feature flags and
Segment (`api.segment.io`) for analytics. Neither is needed to replicate functionality.

## Behavioural notes worth replicating

- **Polling:** `notifications/count?status=unread` is polled continuously on every
  console screen — the badge is the platform's own heartbeat.
- **Cache-busting:** every console request appends `_={epochMillis}`. Not required
  for correctness; the app can rely on its own React Query cache instead.
- **Fan-out:** the Logs tab issues a diagnostics pair per historical instance
  (30+ requests on one screen). On mobile this must be lazy and capped.
- **Org scoping is inconsistent** across products — API Manager, Exchange facets and
  CloudHub use the business-group id, while Access Management and Visualizer use the
  root org id. Sending the wrong one yields empty results rather than an error.

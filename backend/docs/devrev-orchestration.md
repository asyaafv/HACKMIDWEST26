# Phase 2: durable real DevRev agent handoffs

## Implementation and review boundary

Gate persists a three-stage advisory run in PostgreSQL, then invokes the actual published agents in order: Purchase Authorization (`4`), Risk & Fraud (`7`), Approval Manager (`8`). It reuses Phase 1's invocation payload, HTTP adapter, callback authentication, event normalization and tool-output extraction in `src/devrev-async.mjs`. Fastify's existing API process polls durable work; no new framework, queue service or financial worker is required.

Every stage gets the same request ID, its specialized task, and the previous stages' bounded findings. Backend facts and agent commentary are labeled separately. Each agent must independently call `custom__gate-mcp_GateGetRequest`. Gate advances only when the HTTP response confirms the correlated session, an authenticated callback contains a successful sandbox MCP result from the read-only connection, and the final JSON matches that stage's own trace, request version, verdict and risk score. Final prose alone never proves tool execution. No backend function fabricates an agent response.

The new `/mcp/orchestration` transport exposes only `gate_get_request`, with the existing authentication, capability and project checks. Its output includes `access_mode: orchestration_read_only`. The existing `/mcp` catalog and financial workflow are preserved.

**Not deployed or tested live in Phase 2 yet.** Local integration tests use real isolated PostgreSQL and mocked DevRev transport. Phase 1's actual live MCP evidence is documented separately in `devrev-phase-one-smoke.md`. No Render settings, DevRev agent versions, connectors, webhooks, credentials or production transaction records were changed during Phase 2 implementation. Only read-only DevRev metadata lookups were performed.

## Current agents and activation blocker

Read-only `POST /internal/ai-agents.get` on October 11, 2026 returned `agent.default_version_id.id`:

| Agent | Full agent DON | Current default version suffix |
| --- | --- | --- |
| Purchase Authorization | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/4` | `:ai_agent_version/4.1` |
| Risk & Fraud | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/7` | `:ai_agent_version/7.1` |
| Approval Manager | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/8` | `:ai_agent_version/8.1` |

These defaults include additional skills: `GatekeeperReview` and, on agents 7 and 8, `GateRequestSpend`, among others. **They are not eligible for this read-only coordinator.** After review, publish new versions of these same agents with only `GateGetRequest`, using the new read-only Gate connector. Keep their specialized guidance. This implementation does not change their existing versions or give them finance permissions.

Preflight checks the API token's organization, the dedicated webhook's active HTTPS destination, and the agent's default version and sole allowed skill. Since the verified metadata endpoint does not expose historical version inspection, the pin must match the current default. Republishing an agent stops new dispatches until an operator reviews and updates its pin. The execution request always supplies `agent_version`; it does not silently follow the newest version. Confirm the version is published in Agent Studio before setting its pin.

DevRev supports `agent_version` in its [async execution reference](https://developer.devrev.ai/beta/api-reference/ai-agents/ai-agent-events-execute-async). The proven `/internal/` route and webhook pattern follow its [async API guide](https://developer.devrev.ai/beta/guides/agents-async-api). The existing PAT owner successfully invoked all three agents in Phase 1. Required account permissions include access to those agents, their connection, and the dedicated webhook; the reference does not specify an exact named execution scope.

## Persistence and recovery

Migration `090_devrev_orchestration.sql` creates only three advisory tables, tenant RLS and narrow grants:

- `orchestration_runs`: requester and initiating credential, idempotency key, request snapshot, stage pointer, status, escalation draft, error and retry lineage.
- `orchestration_stages`: agent/version/session bindings, prompt hash, dispatch state and HTTP status, successful MCP facts/trace, final response, verified findings, errors and deadlines.
- `orchestration_events`: authenticated, sanitized event projections, semantic deduplication hash, receipt time and late-event flag. Raw credentials and full customer source records are not retained.

Starts are idempotent per tenant/principal/key; different inputs on the same key conflict. Workers claim runs with row locks and `SKIP LOCKED`; they persist `SENDING` before network dispatch. A restart resumes undispatched `READY` stages. A network failure or crash during dispatch never automatically replays an uncertain invocation. It waits for its deadline and becomes `TIMED_OUT`; `DISPATCH_UNKNOWN` cannot advance without a confirmed API response. Explicit recovery creates a fresh run and sessions, reruns all three read-only stages and retains the stopped run. It requires an operator's acknowledgment. Late callbacks are recorded but cannot resurrect a stopped stage.

Worker dispatch rechecks the initiating credential, active role, project access and request revision. Callback correlation binds tenant, run, stage, request, agent, session object, session ID and prompt hash. Callback replay cannot advance twice. Request revision changes, unexpected tools, invalid output, mismatched findings, API rejection and agent errors stop the run. No financial table is updated by the coordinator.

For REVIEW, REJECT, missing evidence, human-consent requirements or backend risk at/above the backend threshold, completion becomes `HUMAN_REVIEW_REQUIRED`. The persisted escalation draft contains blockers, verified findings and the next independent human action. Failed/timed-out runs also prepare a diagnostic escalation. This is a retrievable draft, not a sent notification, financial approval, budget hold or payment. Even `COMPLETED` low-risk runs grant no financial consent.

## Configuration

Server environment variables (see `.env.example`):

| Variable | Value |
| --- | --- |
| `DEVREV_ORCHESTRATION_ENABLED` | `false` initially; `true` only after reviewed setup |
| `DEVREV_API_TOKEN` | Existing private PAT in DevRev org `17WZM4zcjj`; separate from Gate MCP authentication |
| `DEVREV_ORCHESTRATION_GATE_ORG_ID` | Existing **Gate tenant UUID**, not DevRev's org ID |
| `DEVREV_ORCHESTRATION_WEBHOOK_SECRET` | Dedicated private callback secret, 32–256 characters |
| `DEVREV_ORCHESTRATION_WEBHOOK_ID` | Dedicated active new-org webhook DON |
| `DEVREV_ORCHESTRATION_PURCHASE_VERSION` | Reviewed published full version DON for agent 4 |
| `DEVREV_ORCHESTRATION_RISK_VERSION` | Reviewed published full version DON for agent 7 |
| `DEVREV_ORCHESTRATION_APPROVAL_VERSION` | Reviewed published full version DON for agent 8 |
| `DEVREV_ORCHESTRATION_TIMEOUT_SECONDS` | Per stage, default 300; permitted 30–900 |

Preserve `DATABASE_URL`, `APP_MODE=sandbox`, exact `MCP_ALLOWED_HOSTS`, browser/origin settings and existing `DEVREV_MCP_*` identity bridge. The bridge must use an existing scoped **AGENT** identity with `request:read` and access to this request. Never use a FINANCE credential for the agents. `DEVREV_TRUST_*` settings and production trust webhook are a separate integration; do not reuse their destination or secret. Do not generate credentials or publish configuration before review.

## Local automated verification

From `backend`, with installed dependencies and Node 24:

```powershell
npm run typecheck
npm run build
npm run orchestration:test
node --test tests/devrev-agent-smoke.test.mjs tests/devrev-agent-smoke-http.test.mjs
npx vitest run tests/workflow.test.ts tests/auth-gatekeepers.test.ts tests/trust-integration.test.ts tests/trust-contracts.test.ts tests/devrev-auth.test.ts tests/mcp-next-driver.test.ts
```

The integration tests create and stop their own local PostgreSQL cluster under ignored `backend/work`. They never use Render's database or invoke actual DevRev agents. They verify durable sequential dispatch, callback races/replay/bindings, timeouts, explicit recovery, tenant isolation, revoked credentials, version/skill preflight and unchanged financial-table contents in both high- and low-risk advisory runs.

## Exact reviewed deployment and live verification sequence

These steps are provided for review; they have **not** been performed.

1. Review source changes and migration 090. Apply `npm run db:migrate` using the existing administrative migration process, without reset/seed/import. Deploy using existing Render `backend` build `npm ci && npm run build` and start `npm start`, retaining `DEVREV_ORCHESTRATION_ENABLED=false`. Use an always-running API instance for reliable deadlines; paused/sleeping instances resume persisted work after wake-up.
2. Privately configure the dedicated callback secret and Gate tenant binding. The disabled server can answer authenticated DevRev verification challenges. Obtain approval before creating a new secret or credential. Do not rotate the existing PAT or Gate credential.
3. Register a separate DevRev webhook via `POST https://api.devrev.ai/internal/webhooks.create`, using the existing private PAT. The exact JSON body is `{url:"https://hackmidwest26.onrender.com/v1/integrations/devrev/orchestration/webhook",event_types:["ai_agent_response"],headers:[{name:"x-api-key",value:"<private dedicated secret>"}]}`. Supply `Authorization: Bearer <private PAT>` privately. Capture only the returned webhook ID/status, never print its headers or full registration response. Set `DEVREV_ORCHESTRATION_WEBHOOK_ID` and wait for `active` in `internal/webhooks.get`. The handler requires `x-api-key` even for `verify.challenge` and returns `{challenge: ...}`. The production trust webhook remains unchanged.
4. In DevRev, configure a dedicated Gate MCP connection at `https://hackmidwest26.onrender.com/mcp/orchestration`, using the existing scoped Gate/DevRev identity mechanism verified in Phase 1. Verify the catalog contains only `GateGetRequest`. Publish reviewed versions of agents 4, 7 and 8 with that sole skill and their specialized role instructions. Remove access to other skills/connections from these versions. Verify the API-invoking PAT owner can use the connection.
5. Copy each **actual published** full version DON into the three pin variables. Do not infer new suffixes from the current versions above. Confirm `internal/ai-agents.get` returns the matching `agent.default_version_id.id` and a single `GateGetRequest` skill for each. Enable orchestration and restart the API. No separate payment worker is needed for this advisory workflow.
6. Run the provided read-only test against the existing request only. In PowerShell, privately load an **existing Gate OPERATOR/ADMIN bearer credential** (with `request:read` and project access) into `GATE_COORDINATOR_TOKEN`; this is not the DevRev PAT. Set `GATE_API_BASE_URL` and then run:

```powershell
# From backend. The token is supplied privately through the environment.
$env:GATE_API_BASE_URL = 'https://hackmidwest26.onrender.com'
$env:GATE_ORCHESTRATION_TEST_KEY = 'phase2-readonly-9de772b5-v1'
npm run orchestration:test:readonly -- --reviewed-hosted
```

For a locally running backend wired to reviewed real DevRev configuration and a separate HTTPS callback tunnel, use `GATE_API_BASE_URL=http://127.0.0.1:8000` and omit `--reviewed-hosted`. The script does not create tunnels, webhooks, tokens or requests. It reads the existing request, starts only advisory orchestration metadata, polls status, records actual agent/version/session IDs and authenticated callback/MCP traces, and compares backend request facts afterward. It refuses a demo with existing consent, authorization or payment. Its report is `work/devrev-orchestration/<runId>.json` (ignored). Repeating the same test key returns the same run; it never automatically recovers a failed run. A polling timeout does not cancel DevRev's already dispatched read-only execution.

Expected demo result: three `SUCCEEDED` stages and `HUMAN_REVIEW_REQUIRED`, with request state unchanged (`AWAITING_EVIDENCE`, REVIEW, risk 85, no consent/authorization/payment). Recheck actual current facts rather than assuming this historical state. Until this live test passes, Phase 2 is implemented and locally verified, not proven live.

## Authenticated API operations

All routes retain tenant/project checks and normal Gate bearer/session authentication. Only OPERATOR/ADMIN may start/recover; reads require `request:read`. Browser mutations retain CSRF checks.

- `POST /v1/orchestrations`, header `Idempotency-Key`, body `{requestId:"9de772b5-4c6f-41b1-9510-46eb74ac28b9"}` → HTTP 202 `{data:{runId},meta:...}`.
- `GET /v1/orchestrations/<runId>` → run, stages, sanitized callback events and escalation draft. This is where the actual handoff evidence and prepared human review can be verified.
- `POST /v1/orchestrations/<stoppedRunId>/recover`, a new stable idempotency key and `{acknowledgeReadOnlyReplay:true}` → fresh linked run. Review the failure first; never replay an uncertain stage automatically.
- `POST /v1/integrations/devrev/orchestration/webhook` → authenticated DevRev callbacks only; never send orchestration responses to `/trust/webhook`.

To halt new dispatches, set `DEVREV_ORCHESTRATION_ENABLED=false` and restart. Already dispatched sessions may still emit callbacks; they cannot execute financial tools through the reviewed read-only connection. Preserve the webhook secret/bindings and advisory records for inspection and later recovery.

# Investigation lifecycle addition

See gatekeeper-investigations.md for MCP 0.4.1, scoped claim/evidence/failure routes,
report schemas and immutable reevaluation history. New proposals wait for an
investigation before human review; missing evidence/hard denials prevent approval.
The demo transaction investigation endpoint is an explicitly labeled local test.

# Current no-login dashboard contract

`GET /v1/demo/dashboard` reads the explicitly configured shared demo workspace.
Returns `data.identity`, catalog, latest 50 requests with linked historical payments,
`transactionReview`, `snapshotHash`, and 100 related audit events. No browser login
is required. Other REST and MCP routes remain authenticated.

`GET /v1/demo/sources/search?q=...` returns authorized imported source selectors.
`GET /v1/demo/transactions/:id/validation` reruns backend evidence and policy checks.
It returns the saved and current decisions, `status:VALID|CHANGED`, change reasons,
the request version and timestamp, and the backend risk model and weights. It is
read-only and preserves archived decisions and reviews. The authenticated equivalent
is `GET /v1/requests/:id/validation` with `request:read` and project scope.
`POST /v1/demo/purchases` accepts the existing Proposal body and Idempotency-Key.
It resolves the purchasing agent's owner/provenance server-side, checks the shared
reviewer's and owner's project grants, and uses the real evidence/policy creation
service. Returns a request with `origin:SIMULATED_PURCHASE`; creates no payment.
Host/Origin protections match demo review writes. No actual DevRev agent is invoked.

`POST /v1/demo/transactions/:id/review` requires the configured Host/Origin,
Idempotency-Key and `{choice:"approve"|"reject", reason, expectedVersion, snapshotHash}`.
Returns `{requestId, choice, paymentExecution:false}` inside the normal data envelope.
Writes only a transaction review, idempotency response and chained audit event.
409 STALE_TRANSACTION requires refresh; 409 ALREADY_REVIEWED prevents competing
reviews; identical retries reuse the original result. A shared demo actor records
decisions, not an authenticated individual. See integration-flow.md.

The contracts below describe authenticated workflows and legacy simulator APIs;
the main dashboard uses the transaction review contract above.

# Gate v1 API contracts

Version: 1.0.0 (additive). Base `/v1`. Success envelope `{data,meta:{traceId,mode:"sandbox",provider:"simulator"}}`; errors `{error:{code,message,details?},meta:{traceId}}`. Authentication routes return `{data}` without the financial envelope. Never treat eligibility, consent, authorization or payment as interchangeable.

Runtime inputs and core outputs are defined in `src/contracts.ts`; `npm run contracts:export` emits [schemas.json](schemas.json) and [openapi.json](openapi.json). Authenticated `GET /schemas` exposes the same registry. OpenAPI describes typed core proposal/preview/consent/payment paths; the remaining endpoints below have documented bounded payloads rather than invented full schemas. Additional response fields are permitted; strict write inputs reject unknown authority/evidence claims.

## Identity and browser flow

`GET /me` returns server-owned `id`, `orgId`, `role`, `approvalLimitMinor`, `capabilities`, `authMethod`. `/catalog` returns allowed agents/projects/merchants/budgets, policy, sandbox/provider labels. Internal Principal additionally contains `credentialId`; no token is returned. Roles: OPERATOR, AGENT, FINANCE, AUDITOR, ADMIN. Backend capability and project checks apply on every call. AGENT reads are restricted to its owned requests. Admin does not imply finance consent.

Private local developer tokens use the Authorization bearer header and remain only in memory. Browser sessions use `POST /auth/login` with `{username,password}`. An exact allowed Host/Origin is required. Response gives `csrfToken` and expiry (28800 seconds); cookie `__Host-gate_session` is Secure, HttpOnly, SameSite=Strict, Path=/, host-only. Use HTTPS and same-origin API requests with cookies; include `X-CSRF-Token` on mutations. Keep CSRF token in memory. `GET /auth/me` returns role/capabilities/projects; `POST /auth/logout` requires cookie/CSRF without a bearer header and revokes the session. Session expiry/revocation is enforced by the server. Re-login obtains a fresh CSRF token. MCP remains bearer-only.

Credential scopes use `payment:reconcile` / `development:fault`, with narrow compatibility aliases `finance:reconcile` / `admin:fault`. Finance can reconcile; only local development admin can select faults. Neither grants finance consent to an agent. Exact `ALLOWED_ORIGINS`, `BROWSER_ALLOWED_HOSTS`, `MCP_ALLOWED_HOSTS` and HTTPS proxy transport must be configured for hosting. Wildcard origins are unsupported.

## Discovery and read endpoints

- `GET /catalog`: scoped configuration snapshots; budget fields are database `limit_minor`, `spent_minor`, `reserved_minor` strings. Available = limit − spent − reserved. Currency is USD.
- `GET /sources/search?q=...`: 2–200 character search, at most 50, `items` / `exhaustive:false`. Search returns exact `domain`, `source_id`, dataset/hash identifiers, never submission authority.
- `GET /sources/detail?domain=pm&sourceId=...`: actual authorized content, hashes, locator, pinned dataset label. Missing/inaccessible = 404. Untrusted text must be escaped.
- `GET /sources/context?projectId=UUID&domain=pm&sourceId=...`: authorized verified source traversal, missing facts, coverage and structural contradictions. Query inputs are validated.
- `GET /requests`: latest 50 authorized full request projections, nonexhaustive. GET detail is authoritative for consent/payment; list projections may omit payment/approval rows.
- `GET /approvals?cursor=...`: finance-only filtered AWAITING_CONSENT queue, newest first, at most 50, `nextCursor` and `exhaustive`. Scope-bound cursor; do not alter filters/principal while reusing it. Queue items provide IDs/project/agent/amount/status/time; fetch request detail for evidence, rules and exact consent. This filters before pagination, so terminal rows do not hide pending reviews.
- `GET /requests/:id`: proposal, version, decision/evidence, separate `policyVerdict`, `consentStatus`, `authorizationStatus`, payment, `permittedActions` (PREVIEW_CONSENT/CANCEL/RECONCILE). Actions reflect current role/scope/state; server rechecks on write.
- `GET /requests/:id/evidence`: actual items, verified links, bundleHash, complete, missing and coverage. Structural gaps cannot be resolved with a finance checkbox.
- `GET /requests/:id/events`: ordered bounded audit (max 100); `GET /requests/:id/explanation`: deterministic facts, actual citations, decision, receipt and limitations.
- `GET /payments/:id`: scoped status/receipt, authorization, attempts/events, retained hold, expiry/dispatch time and job retry/manual-attention fields. Fault mode is visible only to finance/admin. No provider secret is exposed.
- `GET /integrations`: actual authorized dataset pins, database query time, worker heartbeat and explicit local/unverified remote status. Heartbeat is process-level, not proof of this tenant's completed workflow. No configuration flag proves remote DevRev integration.

`/health` and `/health/ready` remain public liveness/basic DB query endpoints outside `/v1`; protected detailed integration state is separate. `/dev-console` exists only when explicitly enabled locally.

## Proposal and money

`POST /policy/preview` evaluates a proposal advisorially, without workflow/provider mutation. `POST /requests` creates a proposal (201 + Location) with one logical-action Idempotency-Key. Fields:

```json
{"agentId":"UUID_FROM_CATALOG","projectId":"UUID_FROM_CATALOG","merchantId":"UUID_FROM_CATALOG","amountMinor":"170000","currency":"USD","category":"diagnostics","purpose":"Proposed synthetic incident diagnostics","source":{"domain":"pm","sourceId":"GATE-ISSUE-101"}}
```

Categories: diagnostics / incident_response. Source domains: pm / crm / document. UUID examples are placeholders. Money is positive integer USD cents as a string, capped at 99,999,999 by the runtime schema. Parse decimal USD with integer arithmetic; reject fractional cents, exponent/comma formats and negatives. Do not use binary floating point or round user input. Source context is synthetic evidence, while purchase parameters/reasons are user proposals. Synthetic dataset 1.0.0 uses historical reference time 2026-10-10T12:00:00Z; preview and worker TTL use operational time.

Every new evaluation includes `decision.riskAssessment`: backend model/version,
rule-point score, maximum, review threshold, `level:LOW|REVIEW_REQUIRED|BLOCKED`,
`lowRisk` and an explanation. LOW returns verdict APPROVE; individual review rules,
incomplete evidence and hard denials override a low score. Scores are not probabilities.
The backend policy owns all weights; the frontend only displays returned values.

## Exact finance consent

`POST /requests/:id/preview` (finance only, key required) returns id, previewHash, expectedVersion, expiry, exact proposal/destination, evidenceHash, policyHash, config versions, decision, sandbox/provider labels. Generating another preview increments the request version. Never silently update a consent form. Expired/stale preview disables consent and requires explicit refresh.

`POST /requests/:id/consent` (finance only, key required):

```json
{"choice":"approve","previewId":"RETURNED_UUID","previewHash":"RETURNED_HASH","expectedVersion":2,"reason":"Reviewed evidence and authorize the exact sandbox purchase","reviewResolutions":["AMOUNT_REQUIRES_REVIEW"]}
```

Use returned hash/version; example 2 is not authority. Resolutions are string codes, not objects. Show every returned HUMAN_JUDGMENT code as an explicit unchecked control. Reasons are required for approval and rejection. Approval atomically reserves budget and queues execution after independent finance/limit/evidence/config/policy checks. Eligibility APPROVE still requires finance consent. Reject records the finance reason and produces no payment. Missing/contradictory required evidence cannot execute.

`POST /requests/:id/cancel` cancels an authorized permissible action only before dispatch; releases a held amount once. `POST /payments/:id/reconcile` (finance/admin, key required) retrieves the existing operation; it never generates a replacement purchase. Local `POST /payments/:id/fault` (admin, key required) accepts `{mode:"SUCCESS"|"DECLINE"|"TIMEOUT_BEFORE_COMMIT"|"TIMEOUT_AFTER_COMMIT"}` before dispatch only. Fault controls are denied unless explicit console development mode, loopback and allowed Host are present; no public debug controls are enabled by default.

COMPLETED + SUCCEEDED + CAPTURED + server receipt is simulated success. QUEUED/PROCESSING are pending. UNKNOWN/RECONCILING retains funds until definitive retrieval; never display success or replace it with a new payment. FAILED releases its hold. Job exhaustion/manual_attention also retains an uncertain hold. Receipts always show simulator/sandbox/no money moved.

## Retry, errors and polling

Keys: 8–128 characters matching `[A-Za-z0-9:_-]`. Persist one key in memory for one logical action, reuse identical body after double click/network loss; changed body under that key conflicts. A refreshed preview starts a new preview/consent action. Retrieve current state after any successful replay because the original result may be older. Do not create another logical purchase to resolve an unknown outcome.

400 invalid input; 401 missing/expired/revoked authentication; 403 capability/role/Origin/CSRF denial; 404 missing/inaccessible; 409 STALE_PREVIEW, STALE_EVIDENCE, IDEMPOTENCY_CONFLICT, INVALID_STATE, ALREADY_DISPATCHED; 422 POLICY_BLOCKED, REVIEW_UNRESOLVED, CONFIGURATION_UNAVAILABLE; 429 rate limit; 500 safe internal failure. Show message and trace ID. No retryable boolean is currently emitted; do not infer safe payment mutation retries from a network error.

Default rate limit is 60 requests/minute per IP. The console polls only active requests, every ten seconds, pauses when hidden, skips unchanged detailed projections and stops at terminal states. Coordinate polling across profiles behind one IP. Production frontend should use bounded backoff and respect 429; never invent progress or paid state.

## Current main-dashboard and enterprise review contract

The temporary backend console is removed. `/dev-console` and its assets return
404. The main frontend uses authenticated `GET /dashboard`: catalog, latest 50
scoped complete request projections, latest 100 associated audit events, explicit
nonexhaustive limits and `paymentExecution:false`. No secret credentials are returned.

`POST /requests/:id/review` accepts the same exact preview/version/hash/reason and
reviewResolutions body as consent, with a retained Idempotency-Key. It requires
independent FINANCE authority and applies the same evidence/configuration/limit
checks. Approval records an approval, AUTHORIZED request and review.approved event;
it creates no payment/job/reservation. With no payment, authorizationStatus is
REVIEWED. Rejection records REJECTED. This is an enterprise decision, not a provider
payment authorization token. Normal `/consent` execution is disabled with 403
EXECUTION_DISABLED; legacy simulator tests can explicitly opt in in-process.

The launcher does not start a worker. Existing payment records remain available
through scoped read paths. Agent/policy editing and arbitrary database resets are
not exposed by the dashboard. Prior console/worker instructions above describe
historical simulator acceptance, not the current product entry point.

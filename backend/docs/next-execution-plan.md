# Gate — backend execution plan while frontend and Gatekeepers are being prepared

**Prepared:** October 10, 2026. **Scope:** backend, a temporary local test console, and contracts for the real Gate frontend and DevRev Gatekeepers. This document plans the next implementation; it does not claim those phases are completed.

Use root `plan.md` as the product specification. This document narrows its sections 5–18 and milestones M0–M5 into the next practical sequence. Preserve brief file-purpose comments and explain only non-obvious money, policy, locking, and recovery logic.

## 1. Current state, verified against code and the database

### Database — exists and runs

Gate has a real **PostgreSQL 18.4** development database named `gate`, reachable locally on port 55432. Its files persist under ignored `backend/work/postgres`; this is not an in-memory mock. A remotely hosted database is still pending.

The live schema contains 21 tables, including:

- Identity/configuration: organizations, principals, credentials, principal/project grants, projects, agents, merchants.
- Financial workflow: budgets, requests, previews, approvals, payments, budget entries.
- Evidence: source records and explicit source links.
- Execution/reliability: jobs, durable simulator transactions, idempotency records.
- Audit: audit events, audit heads, migration metadata.

Database inspection at preparation time found **one organization, one budget, zero sources, zero requests, and zero payments**. The development seed creates identity/control rows; it does not yet create the business dataset requested by the current plan.

Implemented controls include tenant RLS, tenant-bound foreign keys, restricted runtime grants, immutable purchase parameters, row locks, and exact cents. The current schema is a compact first slice of plan section 7, not every planned table. Separate policy versions, sessions, decision/revision histories, authorization/reservation records, payment attempts, and webhook inbox are still needed where the next features require them.

### Payment structure — implemented simulator, incomplete provider boundary

The current working flow is:

```text
proposal -> server evidence -> deterministic eligibility -> exact preview
-> independent finance consent -> atomic budget hold -> durable execution job
-> simulator transaction -> capture/release -> receipt and audit explanation
```

Money is USD cents as strings/integers. Same-action retry keys are persistent; competing approvals cannot exceed remaining budget. A simulated success with a lost response retains its hold and later recovers the same receipt. Cancellation/expiry only release undispatched holds.

Current fault modes are success, definitive decline, and timeout after provider commit. Payment authorization bindings and reservation state currently live in the payment row. This supports the first simulator slice, but plan sections 7/9/15 call for more explicit records as provider integration grows.

Not yet implemented: a standalone provider interface, Stripe/Flex adapter, signed webhook inbox, persisted payment attempts, before-commit timeout/event-order faults, bounded retries/manual reconciliation controls, or public provider-status endpoints. No real money or external provider integration is claimed.

### API, tests, and MCP

- REST includes catalog, request creation/list/detail, advisory preview, finance preview/consent, cancellation, scoped source search, evidence, events, and explanation.
- Six authenticated MCP tools exist: capabilities, source search, advisory preview, proposal submission, request retrieval, and explanation.
- The recorded completed verification is **43 backend tests**, plus eight archived Python policy tests; typecheck/build and a local MCP SDK handshake passed. This planning pass did not rerun that suite.
- Temporary test UI is absent. `frontend/index.html` currently only checks backend health.
- Browser authentication sessions, full configuration APIs, cursor pagination, fine-grained token capabilities, and actual remote Computer registration remain pending.
- Gatekeepers and the custom skill are being supplied by the DevRev workstream. Their actual installed tool signatures, connections, and end-to-end behavior have not been verified from this repo.

## 2. Decisions for the next work

### Follow the current synthetic-data plan

Root plan sections 3 and 12 now specify a fictional, versioned **Gate synthetic demo dataset**. We can build/import this locally without waiting for Enterprise-Bench access. Label every business source `SYNTHETIC_DEMO_DATA` and retain source IDs, hashes, timestamps, and explicit links.

Some backend docs and skill text still reference the earlier Enterprise-Bench-only approach. Align those with the current plan before continuing. Keep tiny `UNIT_TEST_ONLY` fixtures separate from the coherent demo dataset. A successful Gate synthetic demo is not an official Enterprise-Bench evaluation or proof of sponsor-track eligibility; those are separate checks if pursued.

### Build a temporary console

A small console is useful for manually proving the real request/approval/payment flow and for making frontend handoff concrete. Automated financial tests remain the correctness checks.

Place it under `backend/dev-console/`, served by a development-only backend route or local host. Preserve the real frontend team's `frontend/` work. It should use actual REST calls, database state, and the real worker. Its visual design can be basic; its decisions, evidence, approvals, balances, and receipts must be real application results.

Do not add a second policy engine or a mock payment success button in JavaScript. Do not place credentials in checked-in HTML, URLs, browser persistent storage, or console logs. Initially accept a pasted private development token into memory, read `/v1/me` to establish the role, and use separate operator/finance browser sessions. A role dropdown alone does not authorize anything.

### Gatekeeper boundary

“Gatekeepers” are the DevRev agents using the custom skill and Gate MCP connector. Gate's backend owns identity, evidence validation, deterministic eligibility, financial consent enforcement, and execution. The skill provides a repeatable investigation/submission/explanation procedure.

Gatekeeper proposal submission never means finance approved it. Gatekeepers receive no finance consent or arbitrary payment capability. An independent authenticated human authorizes the exact purchase in the console/real frontend.

## 3. Phase A — reconcile contracts and create the demo seed

**Priority:** first. **Plan references:** sections 3, 5, 7, 12; M0/M1/M2. **Estimated effort:** 1–3 focused hours, subject to schema review.

Tasks:

1. Update backend setup/status/import/skill wording to match the current synthetic-data boundary and Gatekeeper naming.
2. Add a canonical small seed under `backend/data/synthetic/`: schema, source files, fixed reference date, manifest/checksums, relationship mapping, README, and stable source selectors.
3. Author a fictional company with two distinct issue → ticket → account paths, supporting documents/commitments, one deliberately missing link, and a separate restricted project/source set.
4. Put contradictory/stale material in clearly identifiable cases. Before using those for decisions, implement structured contradiction/freshness behavior; the existing engine does not detect those merely because prose contains them.
5. Extend evidence traversal to include the verified account path, not just the current one-hop issue→ticket link. Track supported relationship types, coverage, bounded output, and provenance.
6. Add an idempotent `demo:prepare` command: create/reuse the intended demo controls, verify seed, import records once, output nonsecret scenario IDs, and preserve historical executed payments.
7. Keep purchase amounts, policy controls, and expected verdicts separate from business sources.
8. Add `docs/integration-status.md` and a baseline test report so local, hosted, Gatekeeper, and provider readiness are tracked separately.

Demo scenarios:

- S1: $200, complete linked context, allowed merchant; eligible but still needs consent.
- S2: $1,700, complete context; finance review and consent.
- S3: $6,000 or denied merchant; hard denial and zero provider mutations.
- S4: missing relationship or unresolved required contradiction; blocked execution.
- S5: definitive decline and lost-response reconciliation, on separate requests.
- S6: another operator/Gatekeeper, another source, and an access-denied restricted source.

Acceptance:

- Clean setup creates/imports the coherent seed without external accounts or manual SQL edits.
- Repeating preparation does not duplicate source records or existing purchases.
- Source hashes/IDs/relationships validate and two different source paths can be inspected.
- S1–S4 have correct rules and labels; missing/contradictory facts do not become consent.
- Daily caps, duplicate-intent checks, and prior runs do not accidentally contaminate scenario expectations; use fresh run IDs and explicit budgets.

## 4. Phase B — make the temporary console useful

**Priority:** immediately after usable seed. **Plan references:** sections 10/11/18, M2/M3. **Estimated effort:** 2–4 hours.

Keep it to five functional panels/screens:

1. **Connect:** health/readiness, authenticated identity, sandbox provider, dataset version, role/project access. Private token in memory for initial local testing; logout clears it.
2. **Propose:** assigned agent/project/merchant choices from catalog, USD decimal-to-cent parsing, source selection, purpose, advisory preview, explicit submit.
3. **Inspect:** actual request state, evidence/citations, verified relationship path, eligibility rules, required reviews, and source gaps.
4. **Finance:** queue, exact server preview, amount/destination/mode/expiry, review resolutions, approval reason, approve/reject. Stale preview disables consent and must refresh.
5. **Outcome:** held/spent/available balance, payment status/receipt, audit timeline, explanation, cancellation before dispatch, and reconciliation status.

Implementation rules:

- The console calls the same API contracts the real frontend will use.
- Generate one logical-action idempotency key and reuse it after double clicks/network retries. A new request or refreshed preview gets its own action key.
- Use role returned by server, then still handle server authorization failures.
- Escape source/purpose text; do not render untrusted HTML.
- Poll active requests at a bounded interval. Never animate a financial success before backend confirmation.
- Display policy eligibility, human consent, and payment as separate states.
- Mark the console “Gate development console” and every receipt simulated.
- Serve development assets only with an explicit local development flag. Do not expose token entry/demo controls on public hosting by default.

Add necessary read APIs for finance queue, source detail/context, payment detail, and safe readiness/worker visibility. Avoid broad admin editing during this phase.

Add Playwright coverage for S1/S2 consent, rejection, missing evidence, double click, stale preview, role denial, cancellation, decline, and lost response. Include keyboard use of approval controls.

Acceptance: a teammate can complete S2 using separate operator/finance identities, open actual evidence, observe a receipt, and demonstrate S3/S4 without manual database mutation.

## 5. Phase C — complete payment and recovery contracts

**Priority:** before external provider or remote demo. **Plan references:** sections 6–10, 15–18; M3/M5. **Estimated effort:** 3–5 hours.

Tasks:

1. Extract the simulator from `worker.ts` into a payment provider module with explicit execute/retrieve/capabilities contracts. Keep stable payment/operation IDs across retries.
2. Add migrations for explicit authorization, reservation, immutable decision/evidence revision, and payment-attempt records where needed; backfill current state without losing bindings or history.
3. Expose separate consent/authorization/payment status projections. Add normalized JSON output schemas for UI and MCP.
4. Add scoped `GET /payments/:id` and finance/admin reconciliation operation that retrieves an existing transaction instead of creating another payment.
5. Add controlled local demo fault selection before dispatch: success, decline, timeout before commit, timeout after commit. Bind fault selection to that scenario's logical operation; prevent mutation after dispatch.
6. Bound job retries, persist safe error/attempt information, and expose manual-attention status. Preserve holds for uncertain outcomes; do not release merely because retries are exhausted.
7. Add inbox/event handling and duplicate/out-of-order tests before adopting a webhook-dependent provider. Simulator faults can exercise this independently of external credentials.
8. Add business-intent duplicate review separately from same-key transport deduplication. A new key for the same purchase must not silently bypass review.
9. Add ledger reconciliation checks, worker heartbeat, audit verification report, and restart/recovery scripts.

Acceptance:

- No external network call occurs while a financial DB transaction holds locks.
- Restart after provider commit recovers one original receipt and one capture.
- Expired undispatched authorization releases once; dispatched unknown outcome stays held.
- Duplicate/out-of-order events cannot regress success or duplicate accounting.
- Every attempt/error/reconciliation is inspectable with safe codes; no SQL/token leakage.
- Fault scenarios work through supported development controls, not ad-hoc SQL edits.

**Optional external payment:** once the simulator and recovery gates pass, add one documented Stripe-test or sponsor Flex-sandbox adapter. External access is not on the temporary-console critical path. Retain simulator mode as a clearly labeled fallback; do not switch providers for an uncertain operation.

## 6. Phase D — prepare Gatekeepers before the actual agents arrive

**Priority:** can progress alongside the console after Phase A. **Plan references:** sections 13/14/16/18; M4. **Estimated effort:** 2–4 hours for local preparation; platform access/deployment is separate.

### Add missing usable MCP context

The six current tools are a good starting slice, but Gatekeepers cannot yet discover all configured proposal IDs or fetch a source directly through MCP. Add:

- `gate_catalog`: allowed agent/project/merchant IDs, currency/limits, dataset/provider mode; no secrets.
- `gate_get_context`: exact authorized source record and verified related context, with citation/hash/coverage.
- `gate_list_requests`: scoped cursor-paginated requests for status/recovery; no cross-operator data leaks.
- `gate_get_payment`: scoped receipt/status for an existing payment/request, if request retrieval is too broad.

Keep names/signatures stable and publish a versioned capability manifest. Existing proposal fields are camelCase; submission adds `idempotency_key`. The skill must use actual discovered signatures, not assume a different server's snake_case schema.

### Establish real Gatekeeper identity

1. Provision an actual `AGENT` principal and linked agent row per submitting Gatekeeper, with assigned projects/categories, caps, and revocable credential capabilities.
2. Keep human operator credentials separate from agent service credentials. Do not reuse finance tokens.
3. If a Gatekeeper is only a read-only investigator, grant only context/read/preview capabilities; submission is not needed for every agent.
4. Record delegation/initiating-user information if the platform can supply trusted identity. Never trust a user ID in ordinary tool arguments.
5. If a connection is shared, identify it honestly as a service principal; a chat username alone does not become verified finance identity.

### Validate the existing custom skill

Obtain the Gatekeeper workstream's actual custom skill text, tool bindings, triggers, output format, and connection/auth requirements. Mirror the reviewed version in Git with its version/hash. Reconcile it with this backend's catalog/preview/submit/recovery semantics; do not create a competing published skill just because the repo has a template.

Required workflow:

```text
Gatekeeper resolves authorized context and proposal inputs
-> Gate MCP advisory preview
-> explicit permission to record proposal
-> Gate MCP submission with stable key
-> independent human finance consent in Gate
-> durable sandbox execution
-> Gatekeeper fetches and explains actual outcome with citations
```

Use a local MCP SDK scenario driver as the substitute caller until Gatekeepers are available. It must use the same schema, credential scopes, and outcomes the real agents will use; no fake DevRev screenshots/results.

Acceptance:

- Local SDK driver completes proposal/status/explanation and is denied finance consent.
- A second agent/source works using separate credentials; revoked/restricted access fails safely.
- Skill/tool output cannot override rules or source scopes.
- Trigger, missing-tool, ambiguous-source, partial evidence, denied approval, duplicate, and timeout cases are included in the agent handoff suite.

## 7. Phase E — finish shared auth/configuration and freeze frontend handoff

**Priority:** before replacing the console or exposing the service remotely. **Plan references:** sections 7/10/11/16.

Backend tasks:

- Implement human browser sessions/login/logout with hashed passwords or an established identity provider, secure cookies, expiry/revocation, CSRF and Origin checks. Keep MCP bearer auth separate.
- Add bounded finance queue and required filtered/cursor list endpoints.
- Add versioned agent/merchant/project/budget configuration and revocation endpoints only where the real UI needs them; enforce capability separation.
- Add immutable published policy versions and dry-run simulation if policy editing is included in the real frontend scope.
- Separate operational time from the seed's historical reference time.
- Add scoped native-source ACL/record visibility if the Gatekeeper integration requires access narrower than a project.
- Return explicit permissible actions/consent state and stable error/schema contracts.

Handoff package for the frontend engineer:

- Updated `docs/api.md` plus machine-readable OpenAPI/JSON schemas derived from actual contracts.
- Example real API responses from synthetic scenarios, scrubbed of secrets.
- Exact request, review, consent, payment and evidence state semantics.
- Money parsing/display contract, idempotency/version rules, auth flow, allowed origins, polling limits, errors and trace IDs.
- Scenario selectors and temporary-console screenshots; these illustrate backend behavior rather than prescribe the final visual design.
- Required screens from root plan section 11 and tests they must pass.

Acceptance: the real frontend can implement against a frozen versioned contract without changing policy/payment logic or copying the console's token handling.

## 8. Phase F — connect the real components when available

1. Swap console calls to the real frontend and authenticated browser sessions; reuse backend services/state.
2. Deploy persistent API/MCP, worker, and private PostgreSQL using separate migration/runtime identities, secret storage, backups, exact hosts/origins, and HTTPS.
3. Register/authenticate the actual Gatekeeper connector and install/bind the reviewed custom skill. Verify actual tool discovery/calls; registration alone is not success.
4. Run Gatekeeper proposal → frontend finance consent → sandbox receipt → Gatekeeper cited explanation.
5. Repeat with a second authorized teammate and another synthetic source. Include missing evidence, declined consent, and lost-response recovery.
6. Preserve sanitized observed traces, test report, deployment SHA, seed revision, known limits, and a three-minute demo runbook.

Acceptance: another teammate completes the same workflow through the real frontend/Gatekeeper integration and can inspect the same authorized evidence and receipt. Until that happens, integration status remains unverified.

## 9. What can wait

Defer rich graphs, animated AI progress, detailed analytics, native DevRev write-back, automatic organization-wide skill distribution, official external benchmark runs, multiple providers, recurring spend, and advanced forecasting.

Core release gates are usable synthetic evidence, real consent, exact bindings, durable idempotency/accounting, safe recovery, honest modes, and reusable Gatekeeper contracts. Do not trade those for polish.

## 10. Next implementation checklist

- [ ] Align backend docs/skill with synthetic data and Gatekeepers.
- [ ] Create/validate versioned synthetic seed and scenario selectors.
- [ ] Make seed/import setup repeatable without duplicating history.
- [ ] Complete issue/ticket/account evidence and required gap handling.
- [ ] Build local temporary console over real APIs.
- [ ] Exercise separate operator/finance identities with visible holds/receipts.
- [ ] Extract provider and add payment-attempt/reconciliation controls.
- [ ] Expose controlled local fault scenarios and worker readiness.
- [ ] Add required MCP catalog/context/status contracts.
- [ ] Provision dedicated Gatekeeper identities and local SDK driver.
- [ ] Review/mirror the actual DevRev custom skill and freeze its bindings.
- [ ] Add browser sessions and frontend-required configuration/list APIs.
- [ ] Produce machine-readable schemas and frontend handoff.
- [ ] Connect real frontend/Gatekeepers and record second-user proof.

**First execution target:** Phase A, then Phase B. This turns the existing empty-but-working database/payment foundation into a visible, repeatable end-to-end demo while the real UI and Gatekeepers are still being prepared.

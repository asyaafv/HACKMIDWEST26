# Chat 2 handoff — payments, policy, recovery

## Registration

Chat 4 owns shared app wiring. Register `registerPaymentRoutes` from `src/routes/payments.ts` under `/v1` with the existing `GateService`, authenticated principal resolver, and a boolean that is true only in local development. No package or shared contract edits are needed. Add response schemas for the fields below and enforce `payment:read`, `finance:reconcile`, and `admin:fault` capabilities at the HTTP boundary. The service enforces finance/admin role for reconciliation, admin role and development mode for fault selection, and project scope for payment detail. Route paths are:

- `GET /payments/:id`
- `POST /payments/:id/reconcile` with `Idempotency-Key`
- `POST /payments/:id/fault` with `Idempotency-Key` and `{ "mode": "TIMEOUT_AFTER_COMMIT" }`

The fault choices are `SUCCESS`, `DECLINE`, `TIMEOUT_BEFORE_COMMIT`, and `TIMEOUT_AFTER_COMMIT`. Fault changes are denied after dispatch. Do not expose the fault route in production configuration. Response envelope: `{ "data": ..., "meta": { "traceId": "...", "mode": "sandbox", "provider": "simulator" } }`. A payment detail includes `requestId`, `paymentId`, `workflowStatus`, `policyVerdict`, `consentStatus`, `authorizationStatus`, `paymentStatus`, `holdState`, `amountMinor` as a string, `operationKey`, `receipt`, `expiresAt`, `dispatchedAt`, `attempts`, `events`, and `job` with retries/lease/manual attention. The request detail projection also has separate policy, consent, authorization, and payment statuses plus `permittedActions` (`PREVIEW_CONSENT`, `CANCEL`, `RECONCILE`) based on role, credential capability, and current workflow state.

Example reconciliation result after a committed simulator response was lost: `{ "status": "SUCCEEDED", "recovered": true, "receipt": { "provider": "simulator", "mode": "sandbox", "label": "SIMULATED — NO MONEY MOVED", "status": "SUCCEEDED" } }`. Reconciliation only retrieves the existing operation; it never creates a fresh payment or provider key.

## Provider and storage

`src/payments/provider.ts` defines `execute`, `retrieve`, and explicit recovery capabilities. `SimulatorProvider` in `src/payments/simulator.ts` supports `retrieveById` and `recoverByKey`, but no provider cancellation. The payment UUID is the stable operation key. A simulator transaction commits in its own DB transaction before a deliberate after-commit timeout. The receipt is reused after worker restart. No external provider is configured or claimed verified.

`020_payments_recovery.sql` runs after `001_gate.sql` and `010_data_relationships.sql`, before `030_identity_sessions.sql` in the current migration order. It backfills request revisions and authorization snapshots from existing rows without changing existing receipts, bindings, budget entries, or tenant IDs. New records include payment attempts, inbox events, worker heartbeats, and job error/manual-attention state. Baseline `001_gate.sql` remains untouched. Backfilled revision hashes are archival PostgreSQL hashes; new revisions use the service's canonical SHA-256 hash. Do not use archival hashes as fresh authorization bindings.

Worker retries are bounded at five attempts. A definitive decline releases once. A timeout or provider exception after dispatch marks `UNKNOWN`, keeps the hold, and eventually sets `manual_attention`. Event ingestion uses a durable inbox; repeated event IDs must match their original payment and status. A `PROCESSING` event arriving after success cannot regress captured state. Provider calls happen outside financial lock transactions. A late worker response cannot capture or release a terminal hold twice.

Policy keeps hard denies, independent finance consent, exact preview and source/config binding, and fresh dispatch checks. Structured contradictory facts from Chat 1's evidence collector block execution; free-form prose is not assumed contradiction-free. Recent matching agent, merchant, source, and amount with an authorized/paid request causes `DUPLICATE_BUSINESS_INTENT` review independently of idempotency keys.

## Verification and limits

`tests/payments-recovery.test.ts` passed 6 isolated PostgreSQL tests: after-commit recovery with eight concurrent duplicate events and a late processing event, bounded before-commit timeouts, decline release/fault lock, duplicate business intent, concurrent consent under a $300 budget, and undispatched expiry. `npm run typecheck` passed before concurrent shared-contract edits; the latest run reports a schema registry type error in `src/contracts.ts:46`, outside Chat 2 ownership. `scripts/verify-ledger.ts` compares budget counters to immutable entries using `GATE_ORG_ID`; `scripts/recover-payment.ts <org-id> <payment-id>` retrieves one existing operation. Existing `scripts/verify-audit.ts` checks the audit chain. These scripts do not truncate data.

The existing shared `workflow.test.ts` targeted run currently fails before payment execution because another workstream's newly required credential capabilities are absent from that test's seed; Chat 4 should reconcile shared test fixtures and run the full suite. No external Stripe/Flex adapter, webhook signature verifier, or external money movement is present. Reconciliation stores the result for each caller and idempotency key; concurrent same-key retrieval may both read the same existing provider operation before one result is stored, and still creates no new payment. The first tests of the isolated database used the new migration successfully. These changes have not been applied to the shared development database.

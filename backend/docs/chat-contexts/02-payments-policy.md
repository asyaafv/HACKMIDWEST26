# Paste into Chat 2 — Gate policy, payments and recovery

You are implementing **Gate's** financial workflow in `/Users/asuya/Documents/HACKMIDWEST/HACKMIDWEST26/backend`. DevRev agents are **Gatekeepers**. Read repository instructions, root `plan.md` sections 6–10, 15–18, and `backend/docs/next-execution-plan.md` Phase C. Inspect existing services/tests first.

The backend already has exact cents, finance previews/consent, atomic budget holds, PostgreSQL jobs, a durable simulator, audit chains, and recorded concurrency/recovery tests. Extend that foundation; do not rebuild it or call the current simulator an external provider.

## Shared coordination rules

Four chats may share this checkout. Preserve their files/changes; do not switch branches, reset/stash, stage/commit everything, truncate the shared DB, or kill shared processes. No `frontend/` edits.

Chat 4 exclusively owns `src/app.ts`, `src/contracts.ts`, `src/config.ts`, `src/main.ts`, package/lockfiles, test infrastructure, combined API docs/status. Do not edit those or run dependency installers. Export route/plugin modules and write concrete registration/schema/dependency requests in your handoff. Do not modify applied migration `001_gate.sql`.

Brief purpose/algorithm comments are required. Use real PostgreSQL with independent connections for financial tests. Use isolated test databases/namespaces; Chat 4 coordinates the full suite. Never print credentials or mark unavailable integrations verified.

## Your exclusive ownership

- `backend/src/service.ts`, `policy.ts`, `worker.ts`, `worker-main.ts`, `idempotency.ts`, `audit.ts`.
- New `backend/src/payments/**`, `workflow/**`, and financial route modules, e.g. `src/routes/payments.ts`.
- New migrations `020_payments_*.sql`, dependent only on baseline or your own preceding migrations.
- New `backend/tests/payments-*.test.ts`, `policy-next-*.test.ts`, `recovery-*.test.ts`.
- `backend/scripts/verify-audit.ts`, new ledger/recovery scripts.
- Financial docs and `backend/docs/handoffs/02-payments-policy.md`.

Do not edit data/import/seed, auth/MCP, console, shared contracts/wiring, or existing shared tests. Preserve current public method signatures until an additive handoff is agreed.

## Implement

1. Extract simulator execution/retrieval into a provider interface and durable simulator module. Stable payment and operation IDs must survive retries/restarts. Declare actual recovery capabilities.
2. Add explicit authorization/reservation, immutable decision/revision, payment-attempt, and event/inbox records as needed. Backfill existing state without losing bindings, receipts, budget history, or tenant isolation.
3. Keep independent human finance consent, exact preview binding, no self-approval, fresh permissions/config/evidence checks, and deterministic hard denies. An LLM or Gatekeeper cannot override policy.
4. Add scoped payment detail and finance/admin reconciliation methods plus route module exports. Reconciliation retrieves the existing operation; it does not create another payment key.
5. Add supported local demo fault controls before dispatch: success, decline, timeout before commit, timeout after commit. Fault controls must be authenticated, development-only, and immutable once dispatch begins.
6. Add retry/lease/attempt visibility, bounded automatic retries and manual-attention state. An uncertain outcome retains its hold even if retries expire. Never automatically free dispatched funds.
7. Exercise duplicate/out-of-order events with a durable inbox before enabling a webhook-dependent provider. Exactly one capture/release must survive concurrent delivery and late worker responses.
8. Add business-intent duplicate review independently of same-key retry deduplication. Integrate Chat 1's structured evidence requirements without assuming contradictory prose is already detected.
9. Add worker heartbeat, ledger counter reconciliation, audit checks, and safe recovery scripts. No network provider operation inside a DB transaction holding financial locks.
10. Keep external Stripe/Flex optional until simulator/recovery checks pass and documented credentials/contracts exist. Do not invent endpoints or block other work waiting for provider access.

## Handoff and acceptance

Publish `backend/docs/handoffs/02-payments-policy.md` early: provider interface, statuses, permitted-action/consent projection, payment/reconcile/fault route exports, migration order, request/response examples without secrets, tests/results and limitations.

Chat 1 supplies evidence; Chat 3 supplies credential/role checks; Chat 4 wires routes and console controls. If another chat needs edits to your service, take the change yourself or provide a new focused helper rather than letting ownership overlap.

Done means concurrent consent cannot overspend, retries produce one logical payment/receipt/capture, expiry/cancellation serialize with dispatch, failed payments release once, uncertain outcomes remain held, restart recovers the original receipt, and attempts/events are inspectable. Preserve baseline behavior and report any migration/compatibility risk explicitly.

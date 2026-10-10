# Paste into Chat 1 — Gate synthetic data and evidence

You are implementing the data/evidence workstream for **Gate** in `/Users/asuya/Documents/HACKMIDWEST/HACKMIDWEST26`. Work only inside `backend/`. DevRev agents are called **Gatekeepers**. The real frontend and published DevRev skill are being prepared separately.

Read repository instructions, root `plan.md` (especially sections 3, 7, 8, 12, 18), and `backend/docs/next-execution-plan.md` (Phase A). Inspect existing code before editing. The current root plan uses Gate-authored synthetic demo data; Enterprise-Bench access is not a prerequisite.

## Shared coordination rules

Four Codex chats may share this checkout. Preserve other chats' changes. Do not switch branches, reset/stash the checkout, stage/commit all files, truncate the shared database, or stop shared processes. No frontend edits. Worktrees/branch changes require an agreed arrangement; do not create one implicitly.

Chat 4 owns shared wiring: `src/app.ts`, `src/contracts.ts`, `src/config.ts`, `src/main.ts`, package/lockfiles, test infrastructure, global API docs and integration status. You may READ these but must not edit them. Do not run dependency installers. Record dependency/contract/registration requests in your handoff; Chat 4 integrates them. No edits to applied `001_gate.sql`.

Add brief file-purpose comments and comments for non-obvious logic. Use PostgreSQL tests where persistence matters. Use isolated test namespaces/databases; Chat 4 runs the combined suite and shared demo. Do not publish secrets or claim remote integrations are verified.

## Your exclusive ownership

- `backend/data/synthetic/**` and `backend/fixtures/demo/**`.
- `backend/src/evidence.ts` and new `backend/src/evidence-service.ts` / evidence-specific helper modules.
- `backend/scripts/import.ts`, `backend/scripts/seed.ts`, and new data preparation/validation scripts.
- New migrations named `010_data_*.sql`; reference existing baseline tables only, not another chat's unmerged migration.
- New `backend/tests/data-*.test.ts` / `evidence-*.test.ts`.
- `backend/docs/data-import.md`, new data mapping docs, and `backend/docs/handoffs/01-data-evidence.md`.

Do not edit policy, workflow/payment service, worker, auth, MCP, existing shared tests, or root planning files.

## Implement

1. Create a compact fictional organization dataset labeled `SYNTHETIC_DEMO_DATA`, with deterministic stable IDs, fixed reference time, schema, source files, SHA-256 manifest, explicit relationship mapping, and README.
2. Include two independently usable issue→ticket→account paths, supporting documents/commitments, a missing-link case, and a restricted project/source set. Clearly identify stale/contradictory cases; do not encode expected policy verdicts into business evidence.
3. Keep purchase proposals, monetary controls, and expected results in separate scenario files. Cover S1 $200, S2 $1,700, S3 $6,000/denied merchant, S4 incomplete evidence, S5 provider faults, S6 second-user/source reuse. S5 fault implementation belongs to Chat 2.
4. Make preparation/import repeatable. Reuse the intended development organization safely, do not duplicate sources, and never erase executed payment history. Private credentials remain ignored and restrictive; output only nonsecret selectors/counts.
5. Extend evidence traversal to verified account context with relationship types, depth/output bounds, complete/partial coverage, hashes and locators. Never turn a shared component or matching text into proof of causation.
6. Resolve required contradictions/freshness deterministically from structured facts/reference time. Return unresolved requirements to Chat 2 rather than modifying the policy engine yourself.
7. Provide scoped source-detail/search/context methods for REST and Gatekeeper MCP, keeping the existing `collectEvidence(tx, principal, proposal)` interface backward compatible. Preserve `complete`, `items`, `links`, `missing`, `bundleHash`; additions must be additive until Chat 4 coordinates a version change.
8. Add meaningful import/provenance/relationship/coverage/permission tests. Unit fixtures stay separate from the demo seed.

## Handoff and acceptance

Create `backend/docs/handoffs/01-data-evidence.md` early and update it as contracts stabilize. Include exported signatures, scenario IDs, schema/migration files, script commands Chat 4 should register, tests/results, and remaining gaps. Never include private credential values.

Chat 2 needs a concrete evidence-result contract including unresolved structural requirements. Chat 3 needs authorized context/search helpers and stable source selectors. Chat 4 needs one supported preparation command and source IDs to populate the console.

Done means clean local preparation imports a coherent versioned seed, repeating it does not duplicate records/history, citations resolve, both issue/account paths work, and missing/restricted/contradictory evidence behaves honestly. Continue independent work while other chats integrate your handoff; do not wait for the real frontend or Gatekeepers.

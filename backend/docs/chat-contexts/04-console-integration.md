# Paste into Chat 4 — Gate temporary console and integration owner

You are the **temporary development console and integration owner** for **Gate** in `/Users/asuya/Documents/HACKMIDWEST/HACKMIDWEST26/backend`. Read repository instructions, root `plan.md` sections 5/10/11/17/18/21/25, and all of `backend/docs/next-execution-plan.md`, emphasizing Phases B/E/F. DevRev agents are called Gatekeepers; their real custom skill and the real frontend are being built separately.

You implement a small real-API test console and own shared wiring so three parallel backend chats do not collide. Do not rebuild the production frontend or duplicate policy/payment logic.

## Parallel team and ownership

- Chat 1: synthetic data/evidence/import/seed; handoff `docs/handoffs/01-data-evidence.md`.
- Chat 2: policy/workflow/payment/worker/audit; handoff `docs/handoffs/02-payments-policy.md`.
- Chat 3: Gatekeeper MCP/identity/browser auth; handoff `docs/handoffs/03-gatekeepers-auth.md`.
- You: shared route/config/contract/dependency wiring, console, integrated test/report and frontend handoff.

Preserve concurrent changes. Do not switch the shared branch, reset/stash, commit/stage others' files, truncate the shared database, or stop shared processes. Do not edit the other chats' owned implementations; request/propose a change in your handoff and integrate their exported interfaces. No `frontend/` edits.

## Your exclusive ownership

- `backend/dev-console/**`, development console serving route, shared API client helpers for the console.
- `backend/src/app.ts`, `contracts.ts`, `config.ts`, `main.ts`, `db.ts`, `errors.ts`, `hash.ts`.
- `backend/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `scripts/migrate.ts`, `scripts/local-postgres.ts`.
- Existing shared tests `tests/workflow.test.ts`/`policy.test.ts`, plus new console/e2e/integration infrastructure.
- `backend/docs/api.md`, `README.md`, implementation/integration status, test report, frontend handoff docs.
- `backend/docs/handoffs/04-console-integration.md` and integration-only migrations `040_integration_*.sql` only if needed after reviewing upstream migrations.

Other chats reserve migration prefixes 010=data, 020=payments, 030=identity. Applied 001 remains immutable. Their migrations should stand on the existing baseline without relying on another chat's unmerged schema. Coordinate order before applying to shared development DB.

Only you install dependencies/update lockfiles. Collect concrete requests first, serialize installs, keep exact versions and preserve scripts. Verify migrations/RLS/grants and preserve data when integrating. Keep purpose/algorithm comments brief.

## Implement independently, then integrate

1. Create the console under `backend/dev-console/`. Basic HTML/CSS/TypeScript or JavaScript is sufficient; use the actual backend, not mock business decisions or payment results.
2. Five panels: connect/identity/readiness; propose; inspect evidence/rules; finance queue/preview/consent; outcomes/balances/receipt/audit/recovery.
3. Initially accept a private developer token into memory and read `/v1/me` for role. Separate operator/finance browser sessions. No checked-in tokens, URL secrets, persistent browser token storage, or pretend-authority role dropdowns. Integrate Chat 3's real browser sessions when ready.
4. Preserve exact-cent parsing, server preview/version/expiry, explicit finance reason/review resolutions, one logical-action retry key, honest pending/unknown states and sandbox labels. Escape source text and keep keyboard approval flow usable.
5. Serve the console only under an explicit local development setting. No public debug auth/fault controls by default.
6. Register Chat 1's evidence routes/helpers, Chat 2's payment/reconcile/fault routes and state projections, and Chat 3's auth/session hooks. Preserve existing routes while adding versioned contracts. Do not copy their service logic into handlers.
7. Freeze the shared response/status/Principal schema additively. Expose necessary finance queue, source detail, payment detail and worker/integration readiness, using the responsible chat's services. Publish schemas/OpenAPI from actual contracts.
8. Integrate the synthetic seed/preparation command and Gatekeeper SDK driver. Show actual development readiness; configuration presence alone is not proof of remote integration.
9. Add Playwright/manual acceptance across complete S2, S1 consent, S3 deny, S4 gaps, stale preview, role denial, retry/double-click, decline, cancellation, and lost response. Use isolated test DB/ports. The baseline MCP test uses fixed port 58001; coordinate the combined suite so other chats don't run it concurrently.
10. Run combined typecheck/build/unit/PostgreSQL/concurrency/MCP/e2e checks once integrated, fix wiring issues and route implementation defects back to their owner. Record actual test outputs, seed revision and build identifiers.

## Handoff and release gates

Maintain `backend/docs/handoffs/04-console-integration.md`: agreed shared interfaces, dependency requests handled, route registrations, migration readiness, checks run, blockers and next integration actions. Read other handoffs between independent tasks; do not repeatedly poll or treat incomplete files as completed implementations.

Give the real frontend team API schemas, example scrubbed scenario responses, auth/session flow, money/version/idempotency/error semantics, permissible actions and the required screen/test checklist. The real frontend replaces the console without changing financial rules.

Done means a teammate can prepare the seed and complete an actual proposal→finance consent→simulated receipt→audit workflow through the console, with visible real balances/evidence and negative/failure cases. Gatekeeper SDK contracts must be usable; remote DevRev proof waits for actual access/agents. Do not deploy publicly, claim integrations complete, or fake success just to finish the UI.

If a dependency is not ready, continue console structure, client handling, isolated tests, documentation and existing-API paths. Record the precise remaining integration gate and stop only dependent work.

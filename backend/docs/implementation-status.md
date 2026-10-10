# Gate backend implementation status

Initial backend slice, October 10, 2026. This is an incremental implementation of the root plan, not a claim that all P0 features or external integrations are finished.

## Implemented

- Strict TypeScript contracts and exact string cents; brief purpose/algorithm comments across source, scripts, tests, and migrations.
- Fastify REST service, allowlisted origins, safe errors, per-IP rate limits.
- Hashed expiring/revocable bearer identities, server-owned roles, project grants, tenant RLS, composite tenant foreign keys.
- Pure versioned policy with amount/agent/budget/daily caps, merchant reviews, missing-evidence blocks and visible risk factors.
- Approved JSON evidence mapping/import with checksums, original IDs, explicit links, and scoped citations.
- Durable request keys, exact versioned previews, independent finance consent, atomic budget reservations.
- Restricted immutable purchase parameters and consent/accounting history.
- Durable simulator/worker with single payment identity, success/decline and lost-response recovery.
- Cancellation/expiry, agent/finance/source/config revalidation before dispatch, retained unknown-outcome holds.
- Append-only serialized audit chain, scoped explanation and verification command.
- Six authenticated Gate MCP tools sharing the REST application services.
- Computer skill/connector checklist and frontend API handoff.
- Local database/API/worker setup and preserved Python launch compatibility.

## Verified locally

- Type checking and compiled build.
- 43 backend tests pass, including real PostgreSQL checks using the restricted runtime role and independent concurrent connections. Eight archived Python policy tests also pass.
- Same-key retries, competing budget approvals, parallel executors, crash recovery, role/scope/tenant denial, stale sources/previews, revocation, and immutable grants.
- Actual MCP SDK initialize/discovery/call against HTTP server.
- Documented local PostgreSQL startup, migration, private demo controls seed, and audit verification.
- Running API health/readiness return 200; missing bearer credential returns 401; authenticated catalog works; all six MCP tools discover successfully.
- Archived advisory Python tests still pass after Gate naming changes; archive MCP transport remains unverified.

## Remaining milestones

1. Obtain actual organizer export/pin and run the importer against its observed fields; select honest real demo scenarios.
2. Add authenticated browser finance sessions and configuration endpoints; coordinate UI with `docs/api.md`.
3. Add cursor pagination, request recollection/new evidence revisions, full policy version publishing and duplicate-intent review.
4. Add native DevRev evidence adapter if needed, deploy HTTPS MCP, verify actual Computer use and a second authorized teammate's different-record workflow.
5. Add provider interface/external Stripe or documented Flex sandbox, signed webhook inbox, and provider-specific reconciliation.
6. Add operational heartbeat/alerts, bounded retry/manual-attention controls, deployment tooling, external audit checkpoints and demo report.

Policies are immutable code configuration in this slice. No live DevRev connection, external financial provider, real benchmark score, or complete frontend is claimed. Project access is currently project-granular; field-level/native-source ACL fidelity awaits the actual integration.

## Deliberate layout/stack choices

Backend stays in the user-designated `backend/` folder. Existing Python work is preserved under `legacy-readonly/`, renamed to Gate, and documented as archived. Current implementation uses locked npm packages, parameterized `pg` SQL, and versioned migrations rather than introducing a repo-wide pnpm/Prisma restructuring. All financial checks use real PostgreSQL; no SQLite substitute.

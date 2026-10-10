# Console integration verification

Observed October 10, 2026, America/Chicago. Latest combined suite began 16:34:40 and finished in 17.30 seconds.

Base Git revision: `26d1975657b23121c81c8b436055cda94bf23793` (shared uncommitted work retained). Effective source/build-input fingerprint: `0d2e9de07ddd4fa305ac207e7b604408b38cd836a4a62f5c7587a2050ef5d751`. Fingerprint hashes sorted src TypeScript, console assets, package.json, package-lock.json and the canonical manifest, including path separators. It identifies the tested working tree; no deployment or commit is claimed.

Dataset: `SYNTHETIC_DEMO_DATA` 1.0.0; reference time `2026-10-10T12:00:00Z`. Raw manifest SHA-256: `8725d029f67e0d811cc1597c6e0aab8f79f1ce13c88acadd5db38580709c581d`. Canonical importer verifies source-file checksums and structured links. Browser acceptance uses actual `prepareDemo` and repeats preparation after a captured receipt; source counts and paid history remain unchanged.

## Final commands and observed results

- `npm run typecheck`: exit 0.
- `npm run build`: exit 0.
- `npm run contracts:export`: exit 0; machine schemas emitted from actual shared Zod contracts.
- `node --check dev-console/console.js`: exit 0.
- `npm test` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointing to existing Chromium headless shell 1243: exit 0; **9 files, 72 tests passed**, no unhandled errors. Includes shared policy/workflow, concurrency, recovery, data checksums, identity/session/MCP, driver negative cases, client money/retry, serving privacy and eight browser acceptance cases.
- `git diff --check`: exit 0 before final report edits.
- Exact new dependency: `@playwright/test` 1.56.1; serialized npm install updated only its dependency tree and lockfile, audit reported zero vulnerabilities.

Real browser acceptance: S2 $1,700, independent identities/keyboard consent, source detail, held/spent/available balances, simulated receipt and verified audit chain; S1 $200 still needs consent and operator cannot approve; transport double click/retry produces one request; S3 $6,000 hard denial; S4 real missing-link source; stale preview invalidation and finance rejection; predispatch cancellation with no provider mutation; real provider decline; committed lost provider response retains hold then recovers one original transaction through supported reconcile; lost REST submission response retries one persistent key. Development fault scenarios now use authenticated supported local fault routes rather than SQL edits.

PostgreSQL tests apply 001 → 010 → 020 → 030 against temporary private clusters with restricted gate_runtime connections. Shared workflow confirms RLS, tenant/project denial, immutable money/audit grants and no budget oversubscription. No migration, seed reset, truncation or process stop was applied to the shared development DB. No integration-only 040 migration was needed.

Earlier failures were addressed: sandbox shmget denial required authorized execution outside the sandbox; fresh seed capabilities and service aliases were reconciled by the identity owner; shared MCP replay assertion now compares durable data while allowing distinct trace IDs. A pg-pool shutdown race resolved end before idle socket closure, producing 57P01 teardown errors despite passing assertions; shared Pool now waits for removal/closure events. Final suite is clean.

Browser installation in the sandbox could not complete; acceptance used an already installed real Chromium executable, explicitly configured. Fresh environments must install Chromium with `npx playwright install chromium` or provide `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Test logs remain in the local temporary directory; no secrets were copied into docs. [S2 responses](examples/S2.json) and [S2 screenshot](examples/S2-console.png) are real sanitized acceptance artifacts.

## External release gates

No hosted deployment SHA, remote DevRev tool-call proof, actual team skill/hash, production frontend run or external Stripe/Flex receipt exists in this workstream. HTTPS browser login controls are tested against the actual session routes; the console's HTTPS-terminator login path still requires deployment-specific manual acceptance. These external gates remain unverified and are not represented as completed integrations.

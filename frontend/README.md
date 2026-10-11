# Gate frontend

**Final hackathon decision:** retain the original three DevRev agents unchanged
and keep automatic orchestration disabled. No clones or read-only replacement
agents are required for the selected demo. Follow
[the final deployment/demo checklist](../backend/docs/hack-midwest-final-demo.md).

The React/TypeScript/Vite dashboard reads stored PostgreSQL transactions through
the backend. Run `./run-gate.sh` at repository root for the complete local app.
It opens without a login page and refreshes every five seconds. Approve/reject saves
Gate review state and a reason without modifying existing payment records.
The Simulate purchase form uses the same agent, project, merchant, amount,
category, purpose, and source reference as Gate's DevRev MCP proposal. It searches
the scoped imported records and calls the backend's read-only policy preview
before recording a sandbox request. The resulting request and its evidence,
policy verdict, and review requirements appear in the dashboard. This does not
sync live DevRev objects or execute payments.

`npm run build`, `npm test` and `npm run test:browser` validate the frontend.
Browser presentation tests mock API data explicitly; actual database/MCP/browser
acceptance lives in backend/tests/live-frontend.test.ts. Production hosting needs
same-origin /v1 routing to the backend; Vite supplies that proxy only locally.

For Vercel, deploy this `frontend` directory (or set the project's Root Directory
to `frontend`). `vercel.json` builds `dist`, forwards `/v1` and `/health` to
`https://hackmidwest26.onrender.com`, and serves `index.html` for dashboard routes.
Add the deployed frontend's exact HTTPS origin to the Render backend's
`ALLOWED_ORIGINS` to permit review, simulation, and investigation requests.
Keep the Render hostname in `BROWSER_ALLOWED_HOSTS` for the proxied API.

Agent configuration and published policies are read-only. No backend failure uses
browser-local fixtures as fallback. Existing character art and entrance animation
remain presentation assets. See ../backend/docs/integration-flow.md for scope,
review persistence, shared demo identity and deployment configuration.

## Authenticated DevRev review integration (prepared, not deployed)

Use the existing **Settings → Identity** section to sign in with an existing Gate
human username/password. An OPERATOR or ADMIN with `request:read` and access to
the request's project can start orchestration. FINANCE remains the independent
human reviewer. If no human login exists, an administrator must provision one
using the existing `provisionHumanLogin` mechanism after review; a DevRev PAT is
not a dashboard login. No credentials were provisioned by this integration.

The browser uses the existing Secure, HttpOnly, SameSite=Strict session cookie
through the same-origin `/v1` proxy. Only the CSRF token and nonsecret orchestration
retry keys are retained in tab session storage. No Gate bearer, DevRev PAT or
webhook secret belongs in `VITE_*` variables, frontend source or browser storage.
Backend `/v1` responses are private and uncached. Render must retain its hostname
`hackmidwest26.onrender.com` in `BROWSER_ALLOWED_HOSTS` and the exact deployed
Vercel HTTPS origin in `ALLOWED_ORIGINS`; retain existing required origins/hosts.
The current external rewrites already target Render; they need no replacement.
Verify login cookie forwarding on the deployed Vercel domain after review.

Signed-in reads use `/v1/auth/me` and `/v1/dashboard`, with backend project scopes.
Anonymous reads retain the existing shared database demo; a server failure does
not substitute sample data. Signed-in purchase simulation uses the authenticated
request/preview/source endpoints and requires their existing capabilities. Human
UI reviews use `/v1/requests/:id/transaction/review`, reusing the existing bound
transaction-review mechanism: a reason, version and snapshot hash are required.
It records a review annotation and audit event without financial consent,
authorization, payment execution or budget changes. The separate finance consent
API remains unchanged. A recorded UI review does not resolve missing evidence.

Open `/transactions?request=9de772b5-4c6f-41b1-9510-46eb74ac28b9` to inspect the
existing request. For this release, `DEVREV_ORCHESTRATION_ENABLED=false`, so the
review button reports that orchestration is disabled and cannot start a run. In a
future separately reviewed configuration, the button posts only the request ID
with CSRF and an idempotency key, then displays persisted stage findings, sessions,
MCP traces and human escalation. It never fabricates agent responses. Failed or
uncertain dispatches require explicit operator recovery, never an automatic retry.

### Remaining deployment prerequisites

- Production's `gate_migrations` inventory was checked read-only: all 12
  migrations in deployed commit `b92568a8fbfb5a3ebd7e14cbda4d1b4780a3ffd1`
  are applied with matching checksums, including migration 090. This release
  changes no migration SQL and introduces no pending migration. Render's start
  command still runs the migration runner, which should find no SQL to apply.
  Do not reset, reseed or import production.
- Keep the three current Gatekeepers intact. Their broad tool catalogs fail the
  coordinator's strict one-tool published-default preflight. No verified per-run
  DevRev tool restriction is available, so leave orchestration disabled and show
  their verified individual MCP execution traces on the shared request. Do not
  duplicate agents or remove existing skills. The following webhook/pin settings
  describe future automatic orchestration, not requirements for this demo.
- Configure on Render only: `DEVREV_API_TOKEN`,
  `DEVREV_ORCHESTRATION_GATE_ORG_ID` (Gate tenant UUID),
  `DEVREV_ORCHESTRATION_WEBHOOK_ID`, `DEVREV_ORCHESTRATION_WEBHOOK_SECRET`,
  `DEVREV_ORCHESTRATION_PURCHASE_VERSION`, `DEVREV_ORCHESTRATION_RISK_VERSION`,
  `DEVREV_ORCHESTRATION_APPROVAL_VERSION`, and optionally
  `DEVREV_ORCHESTRATION_TIMEOUT_SECONDS` (default 300). Preserve the existing
  scoped AGENT `DEVREV_MCP_*` bridge and sandbox/database settings. Versions must
  be full reviewed published version DONs, not shorthand agent IDs.
- The dedicated active webhook must point to
  `https://hackmidwest26.onrender.com/v1/integrations/devrev/orchestration/webhook`
  for `ai_agent_response`, authenticating with `x-api-key` equal to the dedicated
  secret. Do not reuse the production trust webhook. Exact registration and
  version steps are in `../backend/docs/devrev-orchestration.md`.
- Keep `DEVREV_ORCHESTRATION_ENABLED=false` until the above is reviewed and
  configured. The new readiness endpoint reports local prerequisites only;
  DevRev token/org, webhook and one-tool version checks still occur on dispatch.
  Missing old-backend endpoints or failed preflight appear as errors, not a
  successful handoff. No live external agent runs were performed by these tests.

### Verification

1. Frontend: `npm test`, `npm run build`. Backend: `npm run build` and
   `npx vitest run tests/orchestration.test.ts tests/auth-gatekeepers.test.ts tests/trust-integration.test.ts tests/live-frontend.test.ts`.
2. Browser contracts: set `GATE_BROWSER_TEST_PORT=5191`, then
   `npx playwright test tests/browser/orchestration.spec.ts tests/browser/dashboard.spec.ts`.
   Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to the installed browser path if Chrome
   is unavailable. These contract tests explicitly mock API responses. The backend
   live-frontend suite uses real isolated PostgreSQL, backend, MCP and browser.
3. Local Render proxy check: set server-side `GATE_API_URL=https://hackmidwest26.onrender.com`
   before `npm run dev`. Render must authorize the local origin/host explicitly
   for cookie writes; do not remove CSRF, Secure cookies or origin checks.
4. After a separately approved deployment, sign in on Vercel and open the existing
   request. Confirm its backend risk/evidence/status, then verify orchestration
   remains disabled and no run is created. For the demo, inspect the three
   previously verified individual DevRev agent sessions and their real MCP traces;
   do not describe them as automatic handoffs. Do not infer live success from the
   mock browser tests.

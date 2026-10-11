# Gate backend: current enterprise scope

The backend console is removed. Run `./run-gate.sh` at the repository root and
use the main frontend. Dashboard reads use `/v1/dashboard`; finance decisions use
`/v1/requests/:id/review` with exact preview bindings. Reviews create no payments,
jobs or budget reservations. The launcher starts no worker. Legacy simulator
components remain for regression tests and existing history.

See [current integration flow](docs/integration-flow.md). The old console/worker
walkthrough below is historical acceptance documentation, not the active setup.

# Gate backend

Gate validates fictional synthetic incident context and deterministic spending controls, then holds budget and executes a durable sandbox transaction after independent finance consent. Gatekeepers use the scoped MCP interface. Every receipt is simulated; no money moves.

## Local setup

Requires Node.js 20.19+ and npm. Run from `backend/`:

```bash
npm ci
cp .env.example .env
npm run db:local
```

Keep the database running. In another terminal, after coordinating migrations with any other backend owners:

```bash
npm run db:migrate
npm run demo:prepare
DEV_CONSOLE=true npm run dev
```

Start `npm run worker` separately. Open `http://127.0.0.1:8000/dev-console`. Default API and MCP remain `http://127.0.0.1:8000/v1` and `/mcp`. Existing `/health` remains available to the real frontend.

The console is enabled only with `DEV_CONSOLE=true`, local nonproduction binding, loopback clients and an allowed Host. Defaults include local port 8000 origins/hosts. Other ports require exact `ALLOWED_ORIGINS`, `BROWSER_ALLOWED_HOSTS`, and `MCP_ALLOWED_HOSTS`. Production binding with the console flag fails configuration validation. Development fault controls require the same local gate and an authenticated admin capability.

`demo:prepare` reuses demo controls and imports the checksummed `SYNTHETIC_DEMO_DATA` 1.0.0 sources. It preserves requests/payments/history. New organizations write random private credentials to ignored `work/demo-credentials.json` with mode 0600; secrets are never printed. Existing expired/revoked credentials need authorized reprovisioning; repeating preparation does not rotate credentials or overwrite that file. `demo:seed` creates a new controls-only organization. Do not truncate a shared database to rerun scenarios.

## Real console flow

Use separate browser profiles for OPERATOR and FINANCE. Paste their private development tokens into Connect; tokens stay only in JavaScript memory and logout clears them. Select the assigned agent/project/allowed merchant, search `GATE-ISSUE-101`, select that exact source, and propose $1,700.00. The operator cannot approve.

Finance opens the returned request ID, generates an exact server preview, inspects evidence/rules/destination/expiry, selects every required human review resolution, gives a reason and uses the keyboard-accessible authorization button. With the worker running, request state changes to the actual simulated receipt; held/spent/available balances, sources and audit events update from the API. Eligibility is never finance consent.

For $200 use the same independent consent flow. $6,000 is denied. `GATE-ISSUE-303` has missing context and cannot execute. An admin may select a fault on an already authorized, undispatched payment in the development console; pause only your own isolated worker before selecting faults. `DECLINE` releases the hold; `TIMEOUT_AFTER_COMMIT` shows UNKNOWN with retained funds and finance can retrieve the original payment. Cancellation is available only before dispatch. Retry lost responses using the same logical action, and refresh expired/stale previews before another choice.

Browser session login is also wired: provision private human credentials with `gatekeeper:provision human PRIVATE_INPUT_JSON`, then use an HTTPS terminator with exact allowed Origin/Host. Sessions are Secure/HttpOnly/SameSite=Strict; mutations send the in-memory CSRF token. Revoke browser session explicitly on logout. MCP stays bearer-only. Do not weaken Secure cookies for a remote demo.

## Checks and contracts

```bash
npm run typecheck
npm run build
npm run contracts:export
npx playwright install chromium
npm test
```

PostgreSQL suites use private temporary clusters and databases; they do not reset the development database. Tests run files serially. The baseline MCP test owns 58001 while running; coordinate other chats before the combined suite. Browser API port is 58555. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing Chromium binary. The browser acceptance suite uses the actual seed, REST, independent identities and worker. `test:integration`, `test:concurrency`, `test:mcp`, and `test:e2e` select real checks.

See [API contracts](docs/api.md), [frontend handoff](docs/frontend-handoff.md), [integration status](docs/integration-status.md), [test report](docs/test-report.md), and [integration owner handoff](docs/handoffs/04-console-integration.md). `gatekeeper:scenario` invokes the real SDK driver; `gatekeeper:manifest` regenerates its actual schemas. `ledger:verify`, `audit:verify`, and `payment:recover` inspect existing durable state without creating a new payment.

Remote DevRev calls, the team's actual custom skill, hosted service and external payment sandbox remain unverified. A working local console is not proof of those integrations.

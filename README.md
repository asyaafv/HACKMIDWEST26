# Gate — HACKMIDWEST26

Gate is the enterprise context and authorization layer around existing financial
records. Its main React dashboard reads scoped PostgreSQL-backed API responses;
DevRev Gatekeepers use the same backend through MCP. No DevRev connection is
required to use the current dashboard and imported source records.

From the repository root:

```sh
./run-gate.sh
```

Open the printed dashboard address (normally http://127.0.0.1:5173). The launcher
starts PostgreSQL, applies migrations, prepares synthetic demo context without
resetting history, and starts the API and frontend. It does **not** start a payment
worker. Node.js 22.12+ is required; the launcher can use Codex's bundled runtime.

The dashboard prompts for your identity. Local development accepts an operator,
finance or auditor token from the ignored `backend/work/demo-credentials.json`;
credentials remain in memory. Hosted login requires provisioned human accounts,
same-origin HTTPS routing and the backend's secure session/CSRF flow. Do not share
or commit credentials.

The backend console and separate `/live` workspace have been removed. All product
screens use the main dashboard. Agent/policy configuration is read-only where no
backend editing endpoint exists. No browser-local transaction fixtures are used
as fallback when the API is unavailable.

A finance review records the exact, expiring proposal and decision through
`POST /v1/requests/:id/review`. Approval does not create a payment, queue a job,
reserve budget, or move money. Existing payment records remain readable. Legacy
payment simulation code is retained for regression tests; payment-executing REST
consent is disabled in the normal API process.

Press Ctrl+C to stop services owned by the launcher. Existing history is preserved.
Logs are in backend/work. `./run-gate.sh --smoke` verifies startup and then stops
owned services. If services are already running, restart your owning terminal to
load the updated backend; the launcher never kills somebody else's process.

See [integration flow](backend/docs/integration-flow.md),
[API contracts](backend/docs/api.md), and
[Render deployment](backend/docs/render-deployment.md).

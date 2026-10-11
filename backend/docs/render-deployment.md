# Current dashboard deployment addition

Configure DEMO_WORKSPACE_ORG_ID and DEMO_WORKSPACE_PRINCIPAL_ID to one intended
hackathon organization and an active FINANCE principal with its project grants.
Apply migration 040_transaction_reviews.sql through db:migrate. The dashboard
opens without credentials through /v1/demo/dashboard and records independent
reviews through /v1/demo/transactions/:id/review. Anyone visiting the demo shares
that workspace's reviewer. Route frontend /v1 to the API under the same origin and
configure exact ALLOWED_ORIGINS/BROWSER_ALLOWED_HOSTS. No worker is needed.
The remote deployment has not been changed from this chat.

The following is historical starter-replacement/legacy payment reference; its
worker and login sections are not required by the current dashboard.

# Render deployment handoff

## Observed public service, October 10, 2026

Team URL: https://hackmidwest26.onrender.com

Read-only public checks returned:

- GET /health: 404, Uvicorn origin.
- GET /health/ready: 404.
- GET /live: 404.
- GET /mcp: 200 event-stream without credentials; the open stream times out
  rather than closing like a normal web page.
- POST /mcp initialize: server name `Gate MCP Server`.
- POST /mcp tools/list, without credentials: exactly `gate_health`,
  `gate_evidence_checklist`, `gate_policy_preview`.

This matches the historical Python starter contract. It does not expose the
current TypeScript Gate API, scoped ten-tool MCP workflow, PostgreSQL accounting,
finance consent, or payment worker. No business mutation, credential submission,
DevRev configuration change, or deployment was performed during these checks.

## Replace the starter with the current backend

In the existing Render web service, use the current repository revision containing
the TypeScript backend and connected frontend changes. Change the runtime to Node
(or create a Node service if Render cannot change that service's runtime).
Configure:

- Root Directory: `backend`
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`
- Node version: 24 (supported current launcher/build runtime).
- HOST: `0.0.0.0`
- NODE_ENV: `production`
- APP_MODE: `sandbox`
- DEV_CONSOLE: `false`
- MCP_ALLOWED_HOSTS: `hackmidwest26.onrender.com`
- BROWSER_ALLOWED_HOSTS: `hackmidwest26.onrender.com`
- ALLOWED_ORIGINS: exact actual frontend origin, including scheme; do not assume
  it equals the backend address if the frontend is deployed elsewhere.
- DATABASE_URL: privately supplied persistent PostgreSQL connection string.
- PORT: use Render's injected value.

Apply migrations once using an administrative database identity before starting
API/worker traffic: `npm run db:migrate`. Use a pre-deploy migration command where
supported, or a controlled administrative job. Do not run reset/seed commands
against existing history. `npm run demo:prepare` is an optional, non-resetting
synthetic sandbox import, executed with the administrative identity. Its private
credential output must be retained privately; an ephemeral build filesystem is
not a credential store. Provision dedicated remote humans/Gatekeepers separately.

The API and worker use `SET ROLE gate_runtime`; confirm the connection identity is
permitted to enter that role and the migrations have created its grants. Keep
migration credentials distinct from restricted runtime credentials; do not publish
DB passwords in this document or commit them.

## Persistent worker

Create/configure a separate background worker from the same repository revision:

- Root Directory: `backend`
- Build Command: `npm ci && npm run build`
- Start Command: `node dist/src/worker-main.js`
- Same private DATABASE_URL, NODE_ENV=production, APP_MODE=sandbox.

No hosted simulator payment can finish merely because the web service is running.
The worker must actually consume the queued job. Hosted service/database creation
may incur hosting charges; this handoff does not create or purchase resources.

## Frontend hosting is a separate gate

The current API does not serve React assets. Build the frontend with
`npm ci && npm run build` inside frontend and host frontend/dist. The Vite local
proxy is not present in that static build. Route frontend `/v1` requests to the
backend under the same HTTPS origin before enabling cookie login. SPA routes such
as `/live` must fall back to index.html. Simply deploying frontend/dist and changing
ALLOWED_ORIGINS does not supply that same-origin route.

A separately hosted frontend/API cross-origin session design is not implemented
or tested by the current same-origin client. Do not disable cookie/CSRF/Origin
protections to compensate. Until hosting routing is configured, use the connected
local /live workspace for acceptance against local services.

## Gatekeeper contract and remote verification

After replacement, public `/health` must identify `gate-backend` and /health/ready
must pass. Unauthenticated /mcp discovery must fail with 401; do not retain the
historical public unauthenticated transport. Use a newly provisioned, scoped Gate
AGENT credential to verify authenticated discovery of the ten tools in
computer/capability-manifest.json. Never reuse local operator or finance tokens as
agent credentials.

Review the team's actual DevRev skill: the old names gate_policy_preview and
 gate_evidence_checklist are not the new contract. The new path uses
 gate_catalog → gate_get_context → gate_preview_spend → explicitly permitted
 gate_request_spend → independent REST finance consent → gate_get_request /
 gate_get_payment / gate_explain_request. Follow computer/connector.md for exact
input fields and recovery behavior. Confirm the assigned DevRev platform's
external bearer-auth support; Gate does not implement OAuth yet.

Record actual installed skill/version, connection identity, tool discovery,
second-user scope checks and sandbox receipts before claiming remote integration.
The new backend still imports verified sources server-side; native live DevRev
retrieval/provenance is another gate. No real payments are enabled.

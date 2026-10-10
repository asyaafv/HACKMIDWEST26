# Gate integration flow

## One authoritative workflow

The React frontend and DevRev Gatekeepers are separate clients of the same Gate
backend. PostgreSQL owns identity, source evidence, policy snapshots, requests,
consent, budget holds, payment jobs, receipts, and audit history. Neither client
calculates an authoritative approval or executes a payment itself.

1. An operator uses the frontend REST client, or a Gatekeeper uses the authenticated
   MCP tools, to discover its scoped catalog and imported source context.
2. The backend retrieves authorized source records and verified links. Agent text
   and source instructions cannot grant authority or replace verified evidence.
3. A proposal specifies an assigned agent, project, merchant, exact USD cents,
   category, purpose, and exact source reference. An advisory preview moves no
   money. Submission records the request under a retained idempotency key.
4. The shared GateService evaluates policy, source coverage, configured limits,
   and budget availability. Missing evidence waits; hard denials reject; eligible
   purchases still await independent finance consent.
5. A FINANCE principal retrieves a versioned, expiring preview through REST. The
   frontend shows the exact amount, destination, hash, and required human review
   resolutions. Finance approves or rejects with a reason. MCP exposes no finance
   consent tool, and a DevRev conversation name cannot establish finance identity.
6. Approval rechecks evidence/configuration/policy and atomically reserves budget
   and queues execution. The worker consumes this durable job and uses the sandbox
   provider. An unknown result retains the hold and reconciles the existing
   operation rather than creating a replacement purchase.
7. The frontend retrieves the authoritative result; the Gatekeeper can use
   gate_get_request, gate_get_payment, and gate_explain_request to recover the same
   result. Only actual completed state and the server receipt indicate sandbox
   success. No real money moves in the current provider.

## Running the connected frontend

From the repository root run `./run-gate.sh`, then open the printed **Live
frontend** URL (normally http://127.0.0.1:5173/live). The existing designed visual
workspace remains a separate browser-local demo, with a link to the live workspace.

The Vite development proxy forwards /v1, /health and /mcp to GATE_API_URL. The
launcher sets that address to the actual backend port. The proxy changes the Host
header to the backend host; exact browser Origin checks remain enforced. No
credentials are injected into frontend bundles or proxy configuration.

For a manual independent-identity test:

1. Open /live in an operator browser profile and a separate finance browser profile.
   Enter the respective tokens from the ignored backend/work/demo-credentials.json
   file. Credentials and action bindings stay in memory; reload requires reconnect.
2. Operator selects an assigned agent and merchant, searches GATE-ISSUE-101,
   selects that exact source, reads it, and proposes $1,700.00 diagnostics.
3. Finance refreshes, opens that request, generates a consent preview, reads the
   destination/evidence/rules, explicitly resolves review requirements and enters
   a reason. Authorize the exact sandbox purchase.
4. Refresh the outcome after the worker runs. Inspect completed status, captured
   hold, receipt, spent/available balances and audit timeline.
5. Repeating submission replays the same key. “Start a separate request” explicitly
   starts a new logical purchase; recover uncertain previous submissions first.

For frontend-only development, run `GATE_API_URL=http://127.0.0.1:8000 npm run dev`
inside frontend, with the backend already running and that browser origin allowed.
Production hosting must serve UI and /v1 under the same HTTPS origin (reverse proxy
or hosting routing); the Vite dev proxy is not a production server. Provision human
logins using the identity provisioning script and use cookie login plus in-memory
CSRF. Local bearer entry is only the temporary test workflow.

The live workspace supports catalog/budgets, source search/detail, proposal,
request detail, pending finance review, exact consent, cancellation, reconciliation,
audit and receipt reads. Configuration/policy editing is not an available API.
Finance review opens the first pending item; the bounded queue and recent list do
not claim to be complete history. UI uses backend permittedActions and backend
checks remain authoritative.

## Connecting the actual DevRev Gatekeepers

Use the **TypeScript backend /mcp endpoint**. Do not run the historical Python
starter as a second Gate backend. It duplicates preview logic and uses conflicting
port/tool names; it is retained only as historical reference.

The existing backend/computer/capability-manifest.json and live authenticated tool
discovery are the actual contract. The ten tools share the backend's services:
capabilities, catalog, search_context, get_context, preview_spend, request_spend,
list_requests, get_request, get_payment and explain_request, all prefixed gate_.

Follow backend/computer/connector.md for provisioned Gate AGENT credentials,
HTTPS deployment, exact Host/Origin configuration and SDK scenario checks. Agent
credentials are distinct from DevRev PATs, human finance credentials and provider
secrets. A shared DevRev connection is one service identity, not automatically
one credential per chat user.

Before remote integration is considered complete, supply/review the team's actual
custom skill against these schemas, bind the authenticated HTTPS /mcp connection,
and observe actual DevRev discovery/submission/recovery traces. Confirm the assigned
organization's supported external MCP authentication rather than assuming that its
outbound connection can use Gate bearer authentication. OAuth support is not
implemented in Gate. If the platform requires OAuth, implement that transport
contract before connecting; do not remove authentication to make discovery work.

Gatekeeper-retrieved native DevRev text is currently not automatically ingested as
trusted Gate evidence. Gate validates approved server imports. Actual remote source
retrieval/import, provenance verification, per-project authorization and freshness
must be implemented against the team's real source schema before claiming live
DevRev evidence. Synthetic fixtures stay explicitly labeled SYNTHETIC_DEMO_DATA.

## Verification and remaining boundaries

`backend/tests/live-frontend.test.ts` provisions a private database and private
API/frontend ports. It records a request via actual MCP SDK, consents via an
independent finance browser, executes the worker, and recovers the captured receipt
via MCP. It also loses a committed REST response and verifies browser retries do
not create another request. It never resets the shared demo database.

Frontend unit tests verify exact cents, retained mutation keys and CSRF handling.
Existing backend suites cover scope, policy denials, stale consent, concurrency,
provider uncertainty and accounting. This local proof does not prove DevRev
registration, the actual custom skill, remote source access, hosted HTTPS sessions
or external payment-provider integration. /v1/integrations keeps DevRev status
NOT_CONFIGURED until real remote proof is implemented and recorded.

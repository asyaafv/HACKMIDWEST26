# Gate transaction dashboard flow

The main dashboard opens directly into one server-configured hackathon workspace.
It reads PostgreSQL through `GET /v1/demo/dashboard`, initially and every five
seconds, with polling paused in hidden tabs. No credentials enter the browser.
Failures show an error; previous loaded records stay visible during polling outages.

## Existing records

The current schema stores transactions as `requests` plus optional linked
`payments`; there is no standalone external `transactions` table. Every loaded
request remains visible whether pending, rejected, completed or historically paid.
The response contains the latest 50 granted-project records and 100 related audit
entries. This is a bounded window, not a complete ledger. All loaded dates are shown
by default. New records arrive through database ingestion, authenticated MCP/API, or an explicit
Simulate purchase action;
the dashboard does not fabricate them or run a payment worker.

## Reviews

`POST /v1/demo/transactions/:id/review` accepts choice, reason, expectedVersion,
snapshotHash and an Idempotency-Key. SHA-256 binds the saved proposal, evidence,
policy evaluation and linked payment state. The backend locks request then payment,
checks project scope and snapshot, rejects competing decisions, and atomically
inserts an immutable transaction_reviews row, idempotency result and chained audit
event. A lost response can replay the identical key/body. Changed snapshots require
refresh. The UI keeps its original reviewed snapshot while polling continues.

This is an enterprise assessment of an existing record, not permission to execute
money movement. Approval/rejection changes only Gate review state. Request workflow,
legacy approvals, payments, jobs, reservations and balances remain unchanged. Policy
verdict/risk and human review are displayed separately; human approval does not
change automated policy eligibility. MCP gate_get_request returns transactionReview
so Gatekeepers can retrieve the dashboard outcome while original workflow stays intact.

## Shared demo boundary

The launcher resolves a prepared Gate sandbox FINANCE principal and sets
DEMO_WORKSPACE_ORG_ID and DEMO_WORKSPACE_PRINCIPAL_ID. These are IDs, not secrets.
For hosted demos configure both explicitly, apply migrations, and route /v1 from
the frontend to the API. Without this pair demo routes are absent. The principal
must be active and FINANCE; its existing project grants and tenant RLS still apply.
Visitors share this actor and can view/approve/reject in that scope. Audit records
say shared_hackathon_demo; they do not establish individual human identity.

Demo writes require the configured Host and frontend Origin and deny cross-site
requests. No browser-supplied organization, actor or project expands the scope.
MCP and authenticated REST retain their credential/session protections. The demo
routes expose neither payment execution nor policy editing nor database reset.

## DevRev Gatekeeper

DevRev retrieves enterprise context and calls authenticated Gate MCP tools to
submit/retrieve evidence-backed records and explain decisions. The deterministic
backend evaluates policy; humans use the dashboard to record review decisions.
DevRev installation is still pending and does not block database reads or review.
Direct external transaction ingestion needs an agreed mapping into the current
request/payment schema; it is not assumed implemented by the dashboard connection.

## Local startup

Run ./run-gate.sh. Restart a previously running launcher in its owning terminal.
Preparation preserves financial history. No local tokens need copying or entering.

## Simulate purchase from Gatekeepers

The Gatekeepers page replaces its unsupported Create Gatekeeper button with
Simulate purchase. The form chooses an active purchasing agent, merchant, exact
USD amount, purpose and authorized supporting source. Demo source search and
POST /v1/demo/purchases require the configured workspace/Host/Origin. The backend
resolves the selected agent's owner from PostgreSQL; the browser cannot supply
an actor, organization or credential. Existing credential IDs satisfy provenance
foreign keys but no bearer token is passed or authenticated for this simulation.

The real GateService creates evidence, policy findings, an immutable initial
revision and an audit entry. The permanently stored SIMULATED_PURCHASE origin is
shown in transaction details, including the fact that DevRev investigation is
pending. The form opens the saved transaction after submission. Retained keys
make lost-response retries create one proposal. No payment/job/budget reservation
is created, and the simulation does not claim a live AI investigation.

## Investigation lifecycle update

New proposals now wait for a Gatekeeper investigation. Initial policy findings remain
visible as an initial check, separate from the completed investigation result. The
transaction detail shows persisted milestones, failure/gap information and bounded
evaluation history. Run local investigation tests the handoff with imported evidence;
it does not invoke or claim a live DevRev agent. New source reports are validated,
reevaluated and archived as new versions; earlier human reviews remain historical.
See gatekeeper-investigations.md for the complete 0.4.0 MCP and REST contract.

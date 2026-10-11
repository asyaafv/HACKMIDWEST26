# Gate: main dashboard integration

## Current product boundary

Gate is an enterprise evaluation and authorization layer around existing financial
records. It does not execute payments. The main frontend is the product interface;
the backend console and separate /live workspace have been removed.

React main dashboard → same-origin /v1 API → scoped PostgreSQL records.
DevRev Gatekeepers → /mcp → the same policy, evidence, request and audit services.

DevRev adds enterprise context, but its installation does not wire the frontend.
That frontend connection is now implemented independently. Approved source imports
and current database records are usable while remote DevRev setup is pending.

## Main frontend

- Login uses a private local token during development or provisioned HTTPS human
  sessions. Credentials/CSRF remain in memory; reload requires reconnect.
- Catalog agents/merchants/projects/budgets, recent requests and audit events come
  from /v1/dashboard and /v1/me. No browser fixture fallback is used.
- Data is scoped and bounded: latest 50 requests and 100 associated audit events.
  Metrics describe this loaded window and approved request values, not executed
  spending. Merchant art/portraits are presentation assets, not financial facts.
- Request forms choose an owned agent/assigned project and exact source returned
  by authorized source search. USD is parsed into integer cents without rounding.
- Evidence/policy detail shows real imported content, provenance hashes, missing
  evidence, risk factors, version and current workflow/review state.
- Finance opens an exact expiring backend preview, resolves required human review
  items explicitly, enters a reason and records approval/rejection through /review.
  The server revalidates identity, version, scope, evidence, configuration and limits.
- Approval records an approval row, AUTHORIZED request and review.approved audit
  event only. It creates no payments, authorizations tied to payments, jobs, budget
  entries or reservations. The no-payment approval projection says REVIEWED.
- Agent configuration and published policies are read-only because configuration
  CRUD is not currently an API. Source data can be synthetic; connected does not
  imply live DevRev evidence. Existing historical financial records are preserved.

## Running locally

Run ./run-gate.sh at repository root and open its dashboard URL, normally
http://127.0.0.1:5173. Connect independent operator/finance profiles using private
backend/work/demo-credentials.json tokens. Operator submits a proposal using an
assigned agent, merchant and GATE-ISSUE-101 source. Finance opens its detail and
records an exact review. Refresh reads current database state. No worker runs.

Vite proxies /v1, /health and /mcp to the actual launcher-selected GATE_API_URL.
Hosting must provide equivalent same-origin HTTPS API routing; the development
proxy is not part of the static frontend build. Backend session Host/Origin/CSRF
checks remain intact.

## Developer acceptance

backend/tests/live-frontend.test.ts uses private PostgreSQL/API/frontend ports and
real browsers. It creates a request via actual MCP, reviews through the main
frontend, and asserts zero payments/jobs/provider transactions/budget entries,
unchanged reserved/spent balances, an actual audit event and scoped MCP recovery.
It also loses a committed request response and proves retained-key browser retry
creates exactly one record. Console routes are asserted unavailable.

Legacy payment tests exercise simulator/accounting components in isolation; that
code is not connected to the default product launch or main-dashboard review.
Remote DevRev/custom-skill, real external source import and hosted human-session
acceptance remain separate integration gates. See computer/connector.md.

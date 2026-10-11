# Gate frontend

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

Agent configuration and published policies are read-only. No backend failure uses
browser-local fixtures as fallback. Existing character art and entrance animation
remain presentation assets. See ../backend/docs/integration-flow.md for scope,
review persistence, shared demo identity and deployment configuration.

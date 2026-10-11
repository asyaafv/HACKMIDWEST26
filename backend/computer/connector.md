# Gate Gatekeeper connector — deployment checklist

## Decision response binding (MCP 0.4.1)

Use the existing tools; no additional validation tool is required. After preview or
evidence submission, return the backend `decision.verdict`, `riskScore`, and
`riskAssessment.summary` to the user. A `riskAssessment.lowRisk:true` result returns
APPROVE as a policy recommendation, with human consent still required. Never infer
approval from the numeric score alone or describe rule points as a probability.
For an existing proposal, call `gate_get_request` with `request_id` and
`validate_decision:true`; report `validation.status`, `validation.decision.verdict`,
and its risk explanation. CHANGED means the stored evaluation needs a fresh
investigation before review. Deploy the backend and refresh connector discovery to
0.4.1 to make this binding available to hosted DevRev.

Local stateless Streamable HTTP SDK calls use real scoped Gate identities and sandbox outcomes. Actual DevRev connector discovery/calls, installed custom skill, and second-human reuse remain **UNVERIFIED**. Platform menu labels, authentication support and setup routes have not been observed; confirm them with the authorized team administrator before recording exact instructions. Localhost is reachable only by local SDK callers.

## Team deployment address

The current DevRev team is
`https://app.devrev.ai/maplestudio-playground-10-193711`, with DevRev organization
ID `17WZM4zcjj`. Set `DEVREV_MCP_ORG_ID=17WZM4zcjj` on Render. Keep
`DEVREV_MCP_EMAIL` matched to the connector token owner and retain the existing
scoped `DEVREV_MCP_CREDENTIAL_ID`. The team URL is for DevRev navigation; the
connector server URL remains `https://hackmidwest26.onrender.com/mcp`.

The team supplied `https://hackmidwest26.onrender.com` as the intended public
base URL. The candidate Gate endpoint is `https://hackmidwest26.onrender.com/mcp`.
The Render service now runs the authenticated TypeScript Gate backend. The
DevRev connection must refresh discovery after deployment to pick up the
eleven-tool investigation contract. The hosted PostgreSQL database already contains the
18-record `SYNTHETIC_DEMO_DATA` seed; no second import is needed. DevRev
registration remains unverified.

For the API deployment, configure `HOST=0.0.0.0`, `APP_MODE=sandbox`,
`MCP_ALLOWED_HOSTS=hackmidwest26.onrender.com`, and
`BROWSER_ALLOWED_HOSTS=hackmidwest26.onrender.com`. Let Render supply `PORT`.
Set `ALLOWED_ORIGINS` to the exact actual frontend origin; use
`https://hackmidwest26.onrender.com` only if the UI is served there. Store the real
DATABASE_URL privately in the hosting service. The current main dashboard
records enterprise reviews without starting new payments.

Before registering DevRev, verify `/health`, `/health/ready`, and unauthenticated
`/mcp` denial from an external client, then authenticated MCP SDK discovery using
an independently provisioned remote AGENT credential. A reset or timeout from a
single testing environment does not establish that the deployed service is down.
Gate currently provides bearer-authenticated MCP; confirm the team's DevRev
connection supports this before choosing authentication fields.

The observed DevRev Computer custom MCP connection verifies its secret as a
DevRev personal access token before saving it. For this connector only, Gate can
validate that token against DevRev's `dev-users.self` endpoint and map exactly
one configured DevRev email/org to one existing, expiring Gate AGENT credential.
Enable with all three Render variables: `DEVREV_MCP_EMAIL`,
`DEVREV_MCP_ORG_ID` (the DevRev `devo/` segment), and
`DEVREV_MCP_CREDENTIAL_ID`. This does not change REST authentication. Omit all
three to disable the bridge. The linked Gate credential still controls project
scope, capabilities, and expiry. DevRev resync is needed after configuration.

The browser dashboard is a separate frontend deployment. DevRev uses the
authenticated `/mcp` endpoint directly.

## Public deployment prerequisites

1. Deploy the API and private PostgreSQL. Apply migrations using the admin/migration identity, including the current transaction-review migration; run the API with the restricted runtime role. Do not reset the hosted database as a connector test. A worker is needed only if payment execution is deliberately enabled later.
2. Terminate HTTPS at an approved public hostname. Configure an exact Host allowlist including actual forwarded host/port behavior. The proxy must preserve Authorization, Accept, Content-Type, MCP protocol headers and JSON bodies, and must not redirect `/mcp` to a login page. Configure `trustProxy` only for known proxy addresses with Chat 4; never trust arbitrary forwarded Host/IP headers. Restrict private backend ingress to that proxy.
3. Configure exact allowed browser Origins (scheme, hostname, port), no wildcard. Pass these as attachMcp's fifth argument. Browser sessions use a host-only `__Host-gate_session` cookie: Secure, HttpOnly, SameSite=Strict. Use HTTPS for the browser origin. Cross-site UI hosting requires a separately reviewed cookie/CORS design; this default is same-site. MCP never authenticates from cookies.
4. Provision one Gate AGENT identity/project/credential per submitting Gatekeeper using the commands below. An investigator omits request:submit and receives investigation:write for scoped proposal investigation. Existing credentials require deliberate reprovisioning for this new scope. TTL is 1–168 hours; default 24. Store the returned secret only in the approved connection secret store. It is a Gate credential, independent of DevRev/provider/finance credentials.
5. Do not put secrets in URLs, source control, skills, screenshots or logs. Redact Authorization, Cookie, Set-Cookie, passwords and CSRF headers/bodies. Provisioning private output files use exclusive creation and mode 0600; keep them outside Git. Keep DB credentials in the host secret store. Rotate/revoke after the event and test next-call denial.
6. Verify externally reachable authenticated SDK initialization/discovery and the eleven versioned tools. Missing, expired and revoked tokens fail before tool disclosure. Validate wrong Host/Origin, source/request scope denial, and output errors. Tool output includes trace_id/server_version; dataset_version is null at the envelope until a single active version is configured, with actual source versions/hashes retained in evidence.
7. Update the existing DevRev skill and connector bindings to the eleven names in `capability-manifest.json`; refresh cached connector discovery. `gate_request_spend` needs explicit permission to record. This never grants finance review or payment consent.
8. Record actual DevRev traces for context → advisory preview → permission to record → idempotent proposal → independent Gate dashboard review → cited request state. Include another authorized user's distinct credential/source, denied source, missing tool, negative trigger and timeout recovery. A shared connection is one Gate service identity; a chat name does not establish human identity.

## Local provisioning and SDK commands

Run from backend with an administrative DATABASE_URL supplied privately. These scripts deliberately are not new package/dependency edits.

- `node --import tsx scripts/provision-gatekeeper.ts agent PRIVATE_INPUT_JSON PRIVATE_OUTPUT_JSON`
- `node --import tsx scripts/provision-gatekeeper.ts human PRIVATE_INPUT_JSON`
- `node --import tsx scripts/provision-gatekeeper.ts revoke PRIVATE_INPUT_JSON`
- `node --import tsx scripts/gatekeeper-scenario.ts PRIVATE_SCENARIO_JSON`
- `node --import tsx scripts/gatekeeper-manifest.ts` regenerates the committed versioned manifest; it never publishes to DevRev.

Agent input: orgId, projectId, name, optional investigator, capMinor, expiresInHours. It creates an AGENT principal, linked agent (existing owner_id binding), project grant and scoped credential. Human input: orgId, principalId, username, password (12–256 characters), for an existing active non-AGENT principal. Password replacement revokes prior sessions. Revoke input: orgId, credentialId. Do not use financial identity tokens to provision a Gatekeeper.

Scenario input (private): url, token, proposal matching discovered camelCase schema, permissionToRecord, persisted idempotencyKey; optional requestId to recover an existing outcome. Save the key before invocation. The driver calls actual SDK tools, does not review or execute payments, and prints returned business context/outcomes without the credential. After a network loss it first lists existing requests then retries the identical proposal/key once; it never automatically retries a domain denial or chooses a new key. Finance reviews separately; invoke with requestId later to read policy, review and any historical payment through `gate_get_request`.

## Browser registration contract

Register `authRoutes` from src/routes/auth.ts with `{db, origins, hosts}` under `/v1` (Chat 4 owns shared app registration). Endpoints: POST /v1/auth/login `{username,password}` → secure session cookie and `{data:{csrfToken,expiresIn}}`; GET /v1/auth/me → server identity/role/scopes/projects; POST /v1/auth/logout → revoke session and clear cookie. Me deliberately does not rotate or expose the CSRF secret; loss of the in-memory CSRF token requires login again. Responses use Cache-Control: no-store.

Use `httpAuthenticate` plus `enforceHttpCapability` on REST routes. Cookie mutations require an exact allowed Origin and X-CSRF-Token from login, held only in memory. MCP is bearer-only. Enable the already installed Fastify rate-limit plugin before login registration (5 attempts/minute/IP); verify trusted proxy/IP behavior in deployment. No new password/cookie dependencies are required.

## Proof still required

Actual public URL and TLS/proxy/Host configuration; secure per-user connection support; verified platform setup labels; supplied team custom skill and version/hash; observed installation/triggers/discovery/calls; second authorized remote user and different source. Do not infer these from local SDK success or connector registration.

For claim/evidence/failure schemas, leases and reevaluation, see ../docs/gatekeeper-investigations.md. Refresh actual connector discovery to 0.4.1; local acceptance is not remote installation proof.

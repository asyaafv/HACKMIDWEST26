# Final demo release — original three agents, automatic orchestration OFF

## Verified October 11

- Production frontend alias: https://gate-frontend-sand.vercel.app. Its `/health/ready`
  and `/v1/demo/dashboard` proxy to Render successfully (200).
- Existing request `9de772b5-4c6f-41b1-9510-46eb74ac28b9`: version 2,
  `AWAITING_EVIDENCE`, `REVIEW`, risk 85/100, human consent required, three evidence
  records and `CONTRADICTORY_FACT:GATE-TICKET-404:incident_active` unresolved.
- Live authenticated `/mcp` discovery and `gate_get_request` succeeded, trace
  `eb15a657-912c-4d50-8f18-d53da465929e`. No write tool was called.
- Agents 4/7/8 remain published at versions 4.1/7.1/8.1. Agents 7 and 8 expose
  `GateRequestSpend`. No agent, connection or credential was changed.
- **Current browser writes are blocked:** an empty login payload through the
  production alias returns `403 ORIGIN_FORBIDDEN`, before creating a session.
  Valid production cookie login is not yet verified.

## Safety decision

Keep `DEVREV_ORCHESTRATION_ENABLED=false`. Preserve all original agents and their
capabilities; do not create copies or republish them to remove tools. The
[async API](https://developer.devrev.ai/beta/api-reference/ai-agents/ai-agent-events-execute-async)
and [cookbook](https://developer.devrev.ai/beta/guides/agents-async-api) provide no
verified per-execution tool allowlist or Gate connection credential override.
DevRev's execute-as-user permissions do not establish that Gate's fixed connector
credential loses write permissions for a run. Instructions, version pins and
callback inspection cannot prevent a write that has already executed. The current
coordinator's one-tool preflight is preserved. No new webhook or agent setup is
needed for the chosen demonstration.

Use the actual existing DevRev execution traces, not a new unrestricted automated
run. Phase 1 verified `custom__gate-mcp_GateGetRequest` execution for this request:

| Original agent | Session suffix | Gate MCP trace |
| --- | --- | --- |
| Purchase Authorization (4) | `ai_agent_session/31` | `bbd44a00-f43b-4cfd-adc7-4e1c1a7d802a` |
| Risk & Fraud (7) | `ai_agent_session/32` | `67adecba-441b-4660-8d75-c0758e0851cd` |
| Approval Manager (8) | `ai_agent_session/33` | `c83d8307-22be-476b-bf4f-da530a7be19f` |

Full session prefix: `don:core:dvrv-us-1:devo/17WZM4zcjj:`. These are individual
agent executions on a shared request, **not automatic agent-to-agent handoffs**.

## Finish deployment, only after confirmation

1. Render environment: append `https://gate-frontend-sand.vercel.app` to
   `ALLOWED_ORIGINS` (comma-separated, exact HTTPS origin, no trailing slash).
   Preserve existing permitted origins. Retain `hackmidwest26.onrender.com` in
   `BROWSER_ALLOWED_HOSTS` and `MCP_ALLOWED_HOSTS`; retain `APP_MODE=sandbox`,
   `DATABASE_URL`, `DEVREV_MCP_*` and existing trust settings. Explicitly keep
   `DEVREV_ORCHESTRATION_ENABLED=false`. No DevRev secret goes to Vercel/VITE.
2. An existing Gate human login is required for Settings → Sign in. Use an
   OPERATOR/ADMIN with request/project access to inspect the request; FINANCE is
   a separate human role. Do not enter a DevRev PAT in that form. If no human
   login exists, stop and request authorized provisioning; this pass creates none.
3. Production's migration inventory was checked read-only on October 11. All 12
   migrations in deployed commit `b92568a8fbfb5a3ebd7e14cbda4d1b4780a3ffd1` are
   applied, with no pending migrations or checksum conflicts. Migration 090 is
   applied with the repository checksum. This release changes no migration SQL,
   so it adds no migration or checksum change. Do not run a migration command
   manually for this release.

   ```sh
   # Optional repeat check in Render Shell, backend working directory; read-only:
   node dist/scripts/migrate.js --check
   ```

   The current deployed artifact may predate the checker. Its equivalent
   read-only ledger query, if a repeat check is needed, is:

   ```sh
   node --input-type=module -e 'import pg from "pg";const db=new pg.Client({connectionString:process.env.DATABASE_URL,options:"-c default_transaction_read_only=on"});try{await db.connect();console.log((await db.query("SELECT name,checksum FROM gate_migrations ORDER BY name")).rows)}finally{await db.end()}'
   ```

   Migration 090 creates only three advisory tables, tenant RLS, scoped grants,
   indexes and existing request/principal/credential foreign keys. It contains no
   financial/request DML. The production inventory and checksums were verified.
   Older migrations need separate review if they are ever pending:
   **020 backfills payments/authorizations/revisions; 030 updates credentials;
   060 inserts investigation entries for existing requests; 070 changes payment
   authority constraints; 080 adds trust metadata.** Do not blindly apply them,
   edit applied checksums, reset, seed, or import the production database.
4. Render's recorded start command is `node dist/scripts/migrate.js && npm start`.
   It runs the migration runner on service restart; this release has no pending
   SQL, so the runner should report migrations applied without changing the
   database. Render build: `npm ci && npm run build`, Root Directory `backend`.
5. Deploy the reviewed backend release through Render, then deploy from the
   existing linked frontend folder. These commands are **not executed here**:

   ```powershell
   # Repository root: required builds
   npm --prefix backend run build
   npm --prefix frontend run build
   # After approval and after the reviewed commit is available to Vercel;
   # existing linked project/team, frontend directory
   Set-Location frontend
   npx vercel --prod --scope team_xJQag9nsvbpKlpibzMEINgBY
   ```

   `frontend/vercel.json` already defines the Vite build, dist output and Render
   rewrites. CLI deployment uses the linked project from this folder. For Git
   deployments, verify the root points to `frontend` relative to this repository.
   A push to a production-connected branch may deploy automatically, so push only
   after confirmation.
6. On the confirmed production alias, Settings → Sign in → open
   `/transactions?request=9de772b5-4c6f-41b1-9510-46eb74ac28b9`. Verify `/v1/auth/me`
   returns your Gate role, a Secure/HttpOnly/SameSite=Strict session cookie is set,
   and actual backend evidence/risk/requirements appear. Check Validate decision
   (read-only), then sign out. The DevRev review button stays disabled; do not
   submit purchases or click human approval/rejection for this demonstration.

## 2–3 minute demonstration

- **0:00–0:45:** Open the existing request in Gate. Show backend status, 85/100 risk,
  missing/contradictory evidence and required human review. Run Validate decision;
  report its actual result even if current checks differ from the saved snapshot.
- **0:45–2:00:** In the existing DevRev org
  https://app.devrev.ai/maplestudio-playground-10-193711, open each original agent's
  saved session above. Show the actual `GateGetRequest` execution trace and each
  specialized finding, all correlated to the same request. State that automatic
  handoffs are intentionally disabled until write tools can be restricted per run.
- **2:00–2:30:** Return to Gate. Explain that REVIEW/missing evidence needs an
  independent human; this demo creates no new approval, authorization or payment.
  Never label an old trace as a new run or the individual reviews as handoffs.

Full local browser/login/database regressions passed in the preceding integration
pass. This final pass reruns the affected migration/coordinator tests and builds;
live checks here perform only health, discovery, metadata and request reads.

# Gate backend

Gate checks agent purchase proposals against verified enterprise evidence and deterministic spending rules, then reserves budget and executes a sandbox transaction after independent finance consent.

This first runnable slice includes Fastify REST, authenticated Streamable HTTP MCP, PostgreSQL tenant isolation and financial locks, approved JSON evidence import, a durable payment simulator/worker, and an append-only audit chain. Every payment is simulated; no money moves.

## Local setup

Requires Node.js 20.19+ and npm. Run inside `backend/`:

```bash
npm ci
cp .env.example .env
npm run db:local
```

Keep that database process running. In another terminal:

```bash
npm run db:migrate
npm run demo:seed
npm run dev
```

In a third terminal:

```bash
npm run worker
```

API: `http://127.0.0.1:8000`; MCP: `http://127.0.0.1:8000/mcp`. `/health` preserves the existing frontend health button. `python3 backend/server.py` from the repo root also launches the active API after setup.

The optional local database uses real PostgreSQL 18 binaries from locked `embedded-postgres`, without Docker. All database files stay under ignored `backend/work`. It listens only on loopback; the example password is local-only.

`demo:seed` creates controls and separate operator, finance, auditor, and admin identities. Random 24-hour bearer tokens are written to ignored `work/demo-credentials.json` with restrictive permissions, never printed. Each invocation creates a new isolated organization; it does not reset existing payments. **No enterprise evidence is seeded.**

## Import evidence

Obtain the organizer-approved Enterprise-Bench export and dataset pin. Map its actual fields as described in [data-import.md](docs/data-import.md), then run:

```bash
npm run data:import -- <orgId> <projectId> <approved-data-directory> <mapping.json>
```

Checksums, original source IDs, pointers, and direct links verify before one atomic import. Missing evidence yields `AWAITING_EVIDENCE`; caller flags cannot mark it verified. Incident context does not establish procurement approval or a proposed remedy's effectiveness.

## REST and MCP

[api.md](docs/api.md) provides the frontend contract. All `/v1` routes and `/mcp` require a bearer credential. Workflow mutations also require an idempotency key. Roles and project scopes come from server records.

MCP previews/submits proposals and retrieves outcomes. It has no finance consent or arbitrary payment tool. Finance consent uses REST; browser login/session support is pending. Do not embed private tokens in checked-in frontend code or URLs.

[computer/connector.md](computer/connector.md) describes actual tool names and setup checks. Remote hosting, DevRev installation, and second-user Computer reuse are not yet verified. The archived Python experiment lives in `legacy-readonly/` and is not the active backend.

## Checks

```bash
npm run typecheck
npm test
npm run build
npm run audit:verify
```

Tests start an isolated real PostgreSQL cluster with independent connections and clean it up. They require local PostgreSQL shared-memory and loopback permissions. Minimal test records are engineering fixtures, not hackathon business evidence.

## Implementation boundaries

- Parameterized `pg` SQL and versioned migrations replace Prisma in this initial slice so locks and grants remain explicit.
- The existing layout is retained: code and npm lockfile are under `backend`; frontend files are untouched.
- Evidence collection is synchronous over an immutable import. Native DevRev retrieval, dataset switching, recollection, and broader formats are pending. Submit a new request after completing an import.
- Config/policies are seeded and version-bound. Admin endpoints, browser sessions, fine-grained token scopes, cursor pagination, and richer duplicate-intent checks are pending.
- Simulator success/decline/lost-response recovery are implemented. Stripe/Flex, signed webhooks, operational alerts, and manual reconciliation controls are pending.
- Audit hashes verify against the stored head; external checkpoints and backup automation are pending.

For deployment, use a private PostgreSQL server, separate migration owner credentials, and a nonsuperuser runtime login granted `gate_runtime`. API/worker assume the restricted role. Never deploy the local owner/password remotely. Configure exact HTTPS origins/MCP hosts and secret storage. [implementation-status.md](docs/implementation-status.md) records progress and remaining gates.

# Gate integration status

Verified October 10, 2026: local simulator workflow through development console; all 72 combined checks pass. See [test-report.md](test-report.md) for exact command outputs and source/seed fingerprints.

- Dataset: LOCAL_ONLY, canonical SYNTHETIC_DEMO_DATA 1.0.0 checksummed/imported in isolated acceptance, repeated preparation preserves source IDs and captured payments.
- REST/API and console: LOCAL_ONLY, actual scoped API workflow/finance consent/evidence/balances/receipts/audit and negative recovery exercised. Explicit local development serving flag, Host/client gate and CSP checked. Five panels live in backend/dev-console; no frontend changes.
- PostgreSQL: LOCAL_ONLY, private test databases apply ordered migrations and runtime RLS/grants/accounting tests. Shared development database was preserved; migration coordination remains necessary before applying concurrent new migrations there.
- Worker/provider: LOCAL_ONLY, durable simulator execution, definitive decline, lost response hold/reconciliation, retries/events and audit proved locally. Protected readiness uses observed heartbeat and actual dataset pins. No external money moves.
- Gatekeeper SDK/MCP: LOCAL_ONLY, actual SDK discovery/scoped agents/context/submission/recovery and denied finance/identity overrides verified. Driver and provisioning commands registered; published capability manifest derives from actual schemas.
- Human auth: LOCAL_ONLY, hashed passwords and actual session/CSRF/Host/Origin/logout/expiry tests pass; browser console login hook is integrated. Deployment requires HTTPS terminator and exact configured Host/Origin with independent real human credentials.
- DevRev/custom skill: NOT_CONFIGURED / UNVERIFIED, actual agents/tool-call traces/team skill review are external gates. No remote success is fabricated.
- Real frontend/hosted environment/external payment: UNVERIFIED, no frontend code or public deployment performed. Local console is a temporary API acceptance client.

A configuration flag or a recently seen worker process does not prove remote integration, this tenant's payment completion or another human's consent. The protected /v1/integrations response follows the same boundary. No public debug auth/fault controls are enabled by default.

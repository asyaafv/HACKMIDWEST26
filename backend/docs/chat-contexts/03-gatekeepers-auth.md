# Paste into Chat 3 — Gatekeepers, MCP and authentication

You own **Gatekeeper integration and identity** for **Gate** in `/Users/asuya/Documents/HACKMIDWEST/HACKMIDWEST26/backend`. Gatekeepers are DevRev agents with the team's custom skill; the real agents/skill are being prepared in a separate workstream. Read repository instructions, root `plan.md` sections 13/14/16 plus auth portions of 7/10, and `backend/docs/next-execution-plan.md` Phases D/E/F.

Six authenticated local MCP tools currently share the REST services. Browser sessions, dedicated Gatekeeper provisioning, catalog/source-detail MCP tools and actual remote DevRev proof are pending. A repo skill template is not proof that the published DevRev skill is installed or compatible.

## Shared coordination rules

Four chats may share the checkout. Preserve concurrent changes; do not switch branches/reset/stash, stage/commit all files, wipe the shared DB, or stop shared processes. Work inside `backend/`; no real frontend edits.

Chat 4 owns shared `app.ts`, `contracts.ts`, `config.ts`, `main.ts`, package/lockfiles, test infrastructure and global API/status docs. Do not edit these or run dependency installers. Build exported auth/session route modules, and hand Chat 4 exact registration/schema/dependency needs. Do not edit applied migration `001_gate.sql`.

Use brief purpose/security-method comments. Never put credentials in messages, skill text, checked-in files, URLs or logs. Test with isolated databases/ports/namespaces. Keep local protocol success separate from deployed Computer success.

## Your exclusive ownership

- `backend/src/auth.ts`, `mcp.ts`, and new identity/session/capability helper modules.
- `backend/src/routes/auth.ts` and related auth route modules; registration belongs to Chat 4.
- `backend/computer/**`, including reviewed skill mirror/capability manifest/connector guide.
- New identity migrations `030_identity_*.sql`, dependent only on baseline/your preceding migrations.
- New Gatekeeper/identity provisioning scripts; READ existing `scripts/seed.ts` but leave edits to Chat 1.
- New `backend/tests/auth-*.test.ts` / `gatekeepers-*.test.ts` / `mcp-next-*.test.ts`.
- `backend/docs/handoffs/03-gatekeepers-auth.md` and focused identity/deployment docs.

Do not edit financial services/policy/worker, evidence/import/seed, console, shared tests or planning docs.

## Implement

1. Add `gate_catalog`, `gate_get_context`, scoped paginated `gate_list_requests`, and `gate_get_payment` where necessary. Preserve the six existing names/signatures and publish a versioned capability manifest.
2. Consume Chat 1's evidence/context helpers and Chat 2's payment/recovery services. Use current services for independent work; record unavailable helper contracts instead of copying their logic or inventing success.
3. Provision a real `AGENT` principal and linked agent per submitting Gatekeeper, with project/capability scopes and expiring revocable credentials. Read-only investigator agents receive no submission capability. Never reuse finance credentials.
4. Add credential capability enforcement while retaining server-owned tenant/identity. Preserve existing `authenticate`/project-access consumers; coordinate additive Principal fields with Chat 4.
5. Add human browser session login/logout/me using established password hashing or existing auth tooling, HttpOnly secure cookies, expiry/revocation, CSRF and Origin checks. MCP remains independently bearer-authenticated. Export HTTP auth/session hooks/routes for Chat 4 to register.
6. Create a local SDK scenario driver using real tools, scopes and request outcomes until DevRev Gatekeepers arrive. Do not fabricate a Computer run.
7. Review the team's ACTUAL custom skill when supplied: triggers, tool signatures, input/output schema, connection identity, missing-tool behavior and recovery. Mirror a version/hash in Git. Until supplied, keep a clearly labeled draft/handoff checklist; do not publish a competing org skill.
8. The workflow is context→advisory preview→permission to record→idempotent proposal→independent finance consent→sandbox execution→cited outcome. Gatekeepers never get arbitrary charge or finance-consent tools.
9. Prepare HTTPS connector/secret/proxy/Host/Origin deployment instructions. Record exact platform setup only after verification; don't assume localhost is reachable by DevRev.
10. Test separate principals/sources, permission denial, credential revocation, agent finance denial, shared-connection limitations, positive/negative skill triggers, missing tools and timeout recovery.

## Handoff and acceptance

Write `backend/docs/handoffs/03-gatekeepers-auth.md` early with auth route/plugin exports, session/CSRF requirements, machine-readable tool schemas, capabilities, provision commands, public connection prerequisites, test outcomes, and missing external inputs. No secret values.

Chat 4 needs the browser auth integration contract and reusable MCP driver. Chats 1/2 need any new capability checks affecting their services. Keep identity scope explicit; trusted service identity is not automatically the human chat user.

Done locally means Gatekeeper SDK calls use actual scoped identities, cannot authorize payments, recover existing outcomes, and browser session checks work. Remote done additionally requires actual DevRev discovery/calls and another authorized user's different-source workflow. Continue local preparation when external agents/access are absent; report remote gates as unverified.

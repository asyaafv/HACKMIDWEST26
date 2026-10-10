# Data and evidence handoff

Dataset: `SYNTHETIC_DEMO_DATA` 1.0.0, fixed reference time 2026-10-10T12:00:00Z. All records are fictional. Schema: `data/synthetic/schema.json`; source files: `main.json`, `restricted.json`; hashes, selectors, and relationship mapping: `manifest.json`. Migration: `010_data_relationships.sql` supplements baseline links with typed relations without modifying `001_gate.sql`.

Exports:

- `importEvidence(db, orgId, projectId, root, mapping, restrictedProjectId?)` returns counts, label, and manifest hash; repeated identical imports preserve source IDs and history.
- `stableSourceId(label, domain, sourceId)` and `jsonPointer(value, pointer)` support validation.
- `prepareDemo(db)` creates or reuses the development organization and imports the canonical seed. Chat 4: register `node --env-file-if-exists=.env --import tsx scripts/seed.ts --prepare` as `demo:prepare`.
- `collectEvidence(tx, principal, proposal)` preserves `complete`, `items`, `links`, `missing`, `bundleHash`; adds `unresolvedRequirements`, `coverage`, and `referenceTime`. Items include hashes and locators. Typed issue→ticket→account paths require all hops. Legacy untyped links retain backward compatibility.
- `searchEvidence(tx, principal, query, limit?)`, `getSourceDetail(tx, principal, domain, sourceId)`, and `getSourceContext(tx, principal, projectId, source)` in `src/evidence-service.ts` enforce project access. Chat 3/4: wire these into scoped MCP/REST handlers; no shared wiring was edited here.

Scenarios in `fixtures/demo/scenarios.json`: S1 $200, S2 $1,700, S3 $6,000/denied merchant, S4 missing link, S5 decline and timeout, S6 second user and restricted denial. Main selectors: `GATE-ISSUE-101`, `GATE-ISSUE-202`. Chat 2 owns S5 fault behavior. Chat 2 must consume `unresolvedRequirements` and stop execution when it is nonempty; the current policy only receives `evidenceComplete`, which is already false for these cases. Required codes include `VERIFIED_RELATED_CONTEXT_MISSING`, `CONTRADICTORY_FACT:<source>:<key>`, and `STALE_PRIMARY:<source>`.

Verification: `npm run typecheck` passed; `tests/data-manifest.test.ts` validates hashes and links. PostgreSQL workflow tests could not start here: embedded PostgreSQL `initdb` was denied a shared memory segment (`shmget: Operation not permitted`). Chat 4 should run the combined suite in a PostgreSQL-capable environment. Remote Gatekeeper and provider integrations remain unverified. Preparation has not been run against the shared development database to avoid changing another chat's active state.

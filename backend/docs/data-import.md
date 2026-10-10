# Synthetic demo import

The demo uses fictional `SYNTHETIC_DEMO_DATA` version 1.0.0 under `backend/data/synthetic/`. The fixed reference time is 2026-10-10T12:00:00Z. `manifest.json` pins SHA-256 source bytes, selectors, JSON pointers, project assignments, and typed relationships. The importer verifies these before a transaction and rejects drift on repeat imports. It never deletes requests, payments, or existing evidence.

After migrations, run from `backend/`:

```sh
node --env-file-if-exists=.env --import tsx scripts/seed.ts --prepare
```

Chat 4 should register this as `demo:prepare` in `package.json`. Preparation creates the intended `Gate sandbox` organization only if absent, reuses it otherwise, and creates a separate restricted project. It prints only IDs, counts, label, and manifest hash. On first preparation, private credentials are written to ignored `work/demo-credentials.json` with mode 0600; do not publish that file. A preexisting development organization without a local credentials file requires an authorized operator to provision credentials separately. No dependency installation is needed.

Main source selectors: `pm:GATE-ISSUE-101` → `crm:GATE-TICKET-101` → `crm:GATE-ACCOUNT-101`; and `pm:GATE-ISSUE-202` → `crm:GATE-TICKET-202` → `crm:GATE-ACCOUNT-202`. Missing link: `pm:GATE-ISSUE-303`. Contradiction: `crm:GATE-TICKET-404`. Stale primary: `pm:GATE-ISSUE-505`. Restricted source: `pm:GATE-ISSUE-909`. See `backend/fixtures/demo/scenarios.json` for proposals and expected outcomes, which are separate from business evidence.

For a manually selected tenant/project, `data:import` remains available with `<orgId> <projectId> <root> <manifest.json> [restrictedProjectId]`. Test fixtures stay outside this seed.

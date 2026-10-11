# Current frontend handoff

The main React dashboard is connected through backend-service.ts to /v1/dashboard,
/me, authorized source search, request submission, exact previews and /review.
The backend console and separate /live UI are removed. Review records enterprise
authority only: no payments, jobs or budget reservations. Agent/policy writes are
read-only until backend configuration APIs exist. The former console-based handoff
below is historical reference.

# Frontend handoff — Gate v1

The production frontend replaces the local console without changing financial rules. No frontend files were edited by this workstream. Use [api.md](api.md), [schemas.json](schemas.json), [openapi.json](openapi.json), and the versioned actual MCP schemas in `computer/capability-manifest.json`. Core typed schemas permit additive fields; API documentation explicitly marks bounds and remaining configuration limitations.

## Implement against observed behavior

Five console panels demonstrate identity/readiness, proposal, evidence/rules, finance preview/consent and outcome/balances/audit. Source citations open a scoped real source detail API. All untrusted source/purpose text is rendered with textContent. Finance displays the exact returned destination/amount, hash/version, expiry and explicit unchecked review resolutions; UI permission controls use server permittedActions. A new preview must invalidate old consent. Browser profiles are independent operator/finance identities.

Use Secure cookie login for the real frontend with exact Origin/Host and in-memory CSRF on same-origin writes. Development token entry is a temporary console workflow. Separate MCP agents remain bearer identities with scoped capabilities; the initiating chat username cannot prove human identity. See auth/session and retry contracts in api.md.

Raw real synthetic S2 responses and console screenshot are saved after browser acceptance under ignored `work/console-acceptance/`; scrubbed snapshots are published under `docs/examples/` when the acceptance report confirms them. These demonstrate backend behavior, not final visual design. Never include credential files, bearer tokens, passwords, CSRF tokens or provider secrets in shared artifacts.

## Required frontend checklist

- Overview: scoped current available/spent/held budget, bounded request/finance queues and truthful sandbox/provider indicators.
- Request creation: catalog choices, exact USD parsing, exact authorized source selection, validated purpose/category and one logical submission key.
- Request detail: distinct workflow/eligibility/consent/authorization/payment states, returned permittedActions, evidence path/hashes/gaps/rules and actual audit timeline.
- Source drawer: actual source/domain/version/locator/hashes/text with no untrusted HTML or guessed native URLs.
- Finance: exact preview/expiry/destination, explicit HUMAN_JUDGMENT resolutions, reason, keyboard-accessible authorize/reject and stable consent retry key. Missing required evidence stays blocked.
- Agent/policy/configuration screens: use only actual scoped backend APIs; full configuration CRUD and policy editing are not frozen by this slice. Do not build write controls against imaginary endpoints.
- Audit/explanation: actual receipt/citations and bounded timeline; always label simulated no-money results.
- Integrations: actual observed dataset/database/worker state. DevRev/hosting/provider setup alone does not prove connectivity or a completed second-user workflow.
- Edge states: loading, empty, stale/expired, 401/403/404, 429, uncertain/lost response with held funds, rejection, cancellation, decline, retry/double click. Preserve forms on transient errors and keep one key/body per retry.
- Accessibility: programmatic labels, visible focus, keyboard submission/review, status announcements and text beyond color. Approval/rejection controls are separate and explicit.

Acceptance must exercise real S2 and S1 consent with independent identities, S3 denial, S4 gap, stale preview, role denial, retry/double click, finance rejection, cancellation, provider decline, and response-lost reconciliation to the original receipt. Never animate paid status before server confirmation. Run isolated tests before deployment; do not truncate shared data or stop shared processes.

Remote release gates remain: actual team skill review/bindings, DevRev tool calls, HTTPS session deployment, real frontend consent and second authorized remote identity/source proof. Local SDK/browser acceptance does not satisfy those external gates.

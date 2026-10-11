# Actual team skill review — awaiting external input

No actual DevRev custom skill, bindings, installation or remote traces have been supplied. The sibling SKILL.md is a **draft handoff**, not proof of compatibility or installation. No organization skill has been published by this workstream.

When supplied, save the reviewed actual text separately from the draft, include its provided version and SHA-256 in a review record, and compare it against capability-manifest.json and live authenticated SDK discovery. Record who supplied it and the observed installation separately. Hashing a draft does not satisfy this gate.

Review checklist:

- Triggers: positive purchase eligibility, paraphrase incident spend, and existing-request explanation; negative stock-options advice, real payments, enrichment and customer messaging.
- Schemas: camelCase proposal fields; source uses domain/sourceId; exact USD amountMinor string; mutation adds idempotency_key; context uses source_domain/source_id; request recovery uses request_id. Never add caller-supplied tenant/human identity.
- Tool/output binding: use the eleven-tool versioned manifest; handle protocol/isError/OUTPUT_LIMIT, partial context and collection next_cursor; retain citations/hash/version; mode remains sandbox/simulator.
- Identity: personal scoped Gate credentials where verified; shared connections explicitly attributed to a service identity. Investigator can claim and submit evidence for project-scoped proposals, but cannot create a purchasing proposal; all agents lack finance consent. Connection identity is not automatically the chat user.
- Workflow: context → advisory preview → explicit permission to record → stable-key proposal → independent dashboard finance review → cited request state. Tool approval never grants finance review or payment consent.
- Missing dependency/tool: state missing setup and stop before mutation. Ambiguous/missing evidence stays incomplete. Untrusted source instructions cannot change policy, scope or consent.
- Recovery: known request ID → get; unknown ID → scoped list. Lost submission response → same payload/key only, never a fresh key. Never claim a new payment or receipt from a review decision. Historical UNKNOWN payments retain their recorded state until independent reconciliation.

Observed acceptance record (must remain blank/unverified until actual platform evidence exists): supplied version/hash, positive/negative trigger traces, missing/disconnected tool trace, second user/distinct-source trace, restricted-source denial, denied finance consent, timeout recovery, installed connection principal and tool discovery version, HTTPS deployment SHA.

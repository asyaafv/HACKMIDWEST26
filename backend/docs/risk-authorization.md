# Risk-based sandbox authorization

Policy v3 automatically authorizes an eligible purchase when the deterministic verdict is APPROVE, evidence is complete, and no human review requirement remains. The hardcoded automatic amount ceiling is 100000 USD cents: exactly $1,000 can qualify; every amount above $1,000 requires finance approval. Merchant review, duplicate intent, or combined risk points at/above 40 also require review. Missing/contradictory evidence and hard denials never auto-execute.

Distinct simultaneous submissions lock the assigned agent before evaluating business duplicates and reserving budget. Reusing the same transport idempotency key returns the original request. Automatic authorization has a bound policy snapshot and a null human approval ID; it never fabricates consent. The worker validates policy/configuration, credential, project access, and source content before dispatch and releases revoked/expired holds.

Apply `070_automatic_authorization.sql` via the migration command and restart the API and launcher to use the new behavior. The launcher starts the sandbox payment worker. No external payment provider is enabled by this change. Existing historical requests are preserved and are not automatically backfilled into payments.

Validation: backend typecheck and frontend build; 80 backend regression tests, four automatic-payment tests (including dashboard approval replay and source revocation), 30 frontend unit tests, and four launcher tests passed. Tests use isolated PostgreSQL clusters and installed Chrome.

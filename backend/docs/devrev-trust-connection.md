# Connect Gate Trust Gatekeeper to Gate

## What this adds

Gate calls the published DevRev agent directly, through the documented beta async
API. The draft rules workflow is a demonstration and is not invoked by this bridge.
The agent suggests signal codes and cites transaction IDs. Gate verifies the
citations and their supporting amounts/categories, calculates the adjustment
itself, and reruns deterministic policy before authorization.

New requests opt in only when `DEVREV_TRUST_ENABLED=true`. A durable assessment
stores a frozen snapshot of up to 50 transactions from the same Gate tenant,
purchasing agent and project. There are no tokens or credentials in the snapshot.
Synthetic purchases are labeled `SYNTHETIC_DEMO_DATA`; synthetic training examples
are separately described in the prompt and cannot be cited as real history.

The adjustment is bounded to -10 through +30. Over $1,000 and duplicate business
intent still require independent approval. Hard denials and missing evidence are
preserved. No history is neutral. Failures, invalid answers, unresolved questions
and a missing callback after 60 seconds require review. Calls are dispatched once;
an API process crash before/during dispatch eventually resolves to review, rather
than blindly retrying an agent invocation. Duplicate and late callbacks cannot
authorize another payment or reopen cancelled requests.

Success, approval, decline or timeout alone never means legitimate or fraudulent.
Finance can explicitly label a settled historical request via authenticated
`POST /v1/requests/:id/trust-label`, with an Idempotency-Key and body
`{"legitimacy":"CONFIRMED_LEGITIMATE","reason":"Independent review rationale"}`.
`CONFIRMED_FRAUD` is also supported as a historical label. The reviewer must be
independent, have finance capability and project access. Labels are immutable,
audited, and apply to future snapshots. A decrease requires at least three cited,
explicitly confirmed legitimate purchases matching merchant/category and amount.

## Beginner setup on Render

1. Approve and merge the integration PR. Deploy it to the Render backend, applying
   migration `080_devrev_trust.sql` through the existing migration start command.
2. In your local backend directory run:

   ```sh
   npm run devrev:prepare -- https://hackmidwest26.onrender.com
   ```

   This generates `DEVREV_TRUST_WEBHOOK_SECRET` in ignored `.env` and saves the
   callback URL. It preserves the API token and other settings and prints no secret.
3. Privately copy these values from `.env` into the **Render web service's Environment**:
   - `DEVREV_API_TOKEN`
   - `DEVREV_TRUST_AGENT_ID=don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/6`
   - `DEVREV_TRUST_WEBHOOK_SECRET`
   - `DEVREV_TRUST_ENABLED=false`
4. Save/deploy those Render settings. `/health` should include
   `trust.webhookConfigured=true` and `trust.enabled=false`.
5. Locally run:

   ```sh
   npm run devrev:register-webhook
   ```

   This checks that the hosted callback exists, registers it with DevRev, and saves
   the returned `DEVREV_TRUST_WEBHOOK_ID` in ignored `.env`. If a webhook ID already
   exists it refuses to create a duplicate. A lost registration response requires
   checking DevRev before another registration attempt.
6. In Render add that webhook ID. Confirm DevRev verified the callback, then set
   `DEVREV_TRUST_ENABLED=true` and deploy. Settings required for activation are
   validated at startup; partial settings remain valid while trust is disabled.
7. Submit a clearly labeled synthetic purchase. Check its authenticated
   `GET /v1/requests/:id` response for `trustAssessment.status=COMPLETED`, the cited
   signals, the bounded adjustment, and the resulting deterministic decision.
   Progress events are not proof of a completed assessment.

The hosted callback is:

`https://hackmidwest26.onrender.com/v1/integrations/devrev/trust/webhook`

Every callback, including verification, requires the private `x-api-key` header.
Gate verifies agent ID, a unique session per assessment, tenant, request, assessment
ID and the input hash. API token and webhook headers are excluded from logs.

The API process polls trust assessments automatically. The existing payment worker
is separately required to capture sandbox payments: `npm run worker` locally or
`node dist/src/worker-main.js` in a Render worker service. If both processes poll
trust, PostgreSQL claims ensure only one sends an assessment. Disabling trust stops
new assessments and outgoing calls; already pending assessments expire to review.
Existing authorized payments and history are not backfilled or re-assessed.

## Verification and limitations

Tests use isolated PostgreSQL databases, mocked DevRev HTTP responses and labeled
synthetic data. They verify gating, callback authentication/binding, tenant scope,
history labels, forged citations, cancellation, duplicate deliveries and timeout
recovery. They do not prove the published agent produces compatible JSON or that
the beta endpoint is enabled for this DevRev organization.

The deployed backend observed before this PR had `paymentExecution=false` and no
trust health fields. It must be updated before registering the callback. No live
DevRev assessment or live webhook registration was performed while preparing this PR.
Policy v4 changes the policy hash; previously queued, undispatched authorizations
may be revoked by the existing worker's stale-policy checks and need a fresh review.

DevRev's async endpoints currently use `/internal/` in its beta documentation:
<https://developer.devrev.ai/beta/guides/agents-async-api>. The workflow agent node is
documented as early access; this implementation does not depend on that node.

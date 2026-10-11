# Gatekeeper investigation lifecycle

## Product flow and UI

A new proposal stores its initial policy check and enters WAITING. The transaction
list shows Waiting for Gatekeeper beneath the agent name. Its detail panel keeps
investigation progress, automated policy findings and human review distinct.

The persisted steps are proposal recorded, Gatekeeper investigating, evidence
received, policy evaluated and human review recorded. A real scoped Gatekeeper
connection claims the proposal, retrieves approved context and submits citations.
The dashboard polls every five seconds and shows the stored state, not an animated
estimate. Evidence receipt and policy evaluation commit atomically; their separate
timestamps and audit events preserve both milestones even when evaluation is fast.

Run local investigation is an explicit test action using imported sources. It is
labeled LOCAL_TEST and never claims that DevRev ran. Recheck demo evidence starts
another evaluation; old decisions and reviews remain in Evaluation history.
Failure reasons and unresolved questions appear in the detail panel. Approval is
unavailable until evaluation completes, and missing required evidence or a hard
policy denial prevents approval. Rejection remains an independent human assessment.

## Backend contract

New proposals create investigations rows in the same transaction. Migration 060
also queues preexisting unreviewed requests without linked payments. Already
reviewed and historical payment records retain their existing behavior.

States: WAITING → INVESTIGATING → EVIDENCE_RECEIVED → EVALUATED, or FAILED.
Claims last ten minutes. Claiming returns run_id, request_version and lease_until.
Expired claims may be reclaimed with a fresh operation key. Submission/failure
requires the same actor, run ID, mode and request version; old runs cannot mutate
newer claims. Request locks serialize claim/review/reevaluation. Idempotency keys
and writes commit together. No payment/provider/network operation runs in these
transactions. Requests linked to payments cannot be rewritten by investigation.

Authenticated MCP server version 0.4.1 includes four investigation tools alongside the existing seven:

- gate_list_investigations: {limit}; oldest waiting, failed or expired proposals
  within granted projects; bounded, not exhaustive.
- gate_start_investigation: {request_id, expectedVersion, idempotency_key}.
- gate_submit_evidence: {request_id, expectedVersion, runId, report, idempotency_key}.
- gate_fail_investigation: {request_id, expectedVersion, runId, reason, idempotency_key}.

The submit report is:

```json
{
  "sources": [{"domain":"pm","sourceId":"GATE-ISSUE-101","sourceHash":"64 hexadecimal characters","contentHash":"64 hexadecimal characters"}],
  "links": [{"fromId":"source UUID","toId":"source UUID","relationship":"ISSUE_TICKET","basisPointer":"/ticket_ids/0"}],
  "unresolvedQuestions": []
}
```

Use actual returned values from gate_get_context; examples are not valid hashes or
UUIDs. Sources: 1–20; links: at most 100; questions: at most ten. The primary source
must be cited. Every citation/hash and reported edge must match Gate's currently
verified, project-scoped source graph. Unknown sources, stale content, invented
relationships and actor/tenant overrides are rejected. Omitted graph context is
independently collected by Gate. Question text cannot authorize spending; unresolved
questions make required evidence incomplete. An LLM never submits a verdict or risk
score. Source instructions remain data.

After `gate_submit_evidence`, return `data.decision.verdict`, `riskScore`, and
`riskAssessment.summary` to the user, including a low-risk APPROVE recommendation.
Never replace the backend verdict or calculate a probability in the DevRev skill.
For an existing request, call `gate_get_request` with `validate_decision:true` to
receive a read-only `validation` result containing current backend checks. Report
VALID or CHANGED, the current verdict and risk explanation. APPROVE remains a
policy recommendation requiring separate human consent.

External DevRev evidence must first be ingested through an approved server-side
import/connector into source_records/source_links. This contract does not trust
arbitrary agent-supplied documents or invent a live DevRev fetcher. The actual team
skill, bindings and remote traces remain external integration gates.

Authenticated REST equivalents are POST /v1/requests/:id/investigation/start,
/evidence and /fail with camelCase bodies and Idempotency-Key headers. POST routes
require investigation:write and an AGENT role. Newly provisioned investigator:true
Gatekeepers receive this capability and can inspect proposals within their granted
projects, including another purchasing agent's proposal. Purchasing agents do not
receive this capability. No investigation tool grants finance consent.

## Reevaluation and history

Gate validates the report, collects canonical source-backed context, recomputes its
deterministic policy and increments the request version. It inserts an immutable
request_revisions snapshot and investigation_reports row plus chained audit events.
Initial and previous evidence/decisions remain stored. Human reviews are unique per
request version; a new version needs a new review, while previous reviews remain
visible in history. Approval/rejection never creates payments, jobs or reservations.

GET /v1/requests/:id/history returns the latest ten evaluation summaries with source
hashes, questions and the human review associated with each version. Stored full
snapshots remain in PostgreSQL; bounded history is not claimed exhaustive.

Shared demo endpoints:

- POST /v1/demo/transactions/:id/investigation {expectedVersion} runs the local
  test against imported context. Stable derived keys recover a lost response.
- GET /v1/demo/transactions/:id/history returns scoped evaluation history.
- GET /v1/demo/transactions/:id/validation reruns current evidence and backend policy,
  preserving the saved evaluation. The frontend's Validate decision button displays
  the comparison, recommendation and server-provided risk algorithm.

Shared demo actions retain exact Host/Origin checks and fixed server-owned tenant
and finance identity. Credentials are never supplied by the browser. LOCAL_TEST
and GATEKEEPER are recorded separately. GATEKEEPER proves the scoped connection,
not its external provider or the identity of a human in a chat.

## Deployment and actual DevRev handoff

Apply migration 060 before starting the new API revision. Refresh connector tool
discovery to version 0.4.1. Provision a dedicated investigator:true credential and
store it only in the DevRev connector's secret configuration; existing read-only
credentials are not silently expanded. Update the actual custom skill to poll the
queue, claim, retrieve context, submit exact hashes/links/questions, record failures
and recover by request ID. Refresh to 0.4.1 for optional decision validation and
backend risk summaries. Record remote traces before claiming live DevRev success.

Local acceptance uses real PostgreSQL, MCP SDK and browser calls. It covers claims,
expiry fencing, forged/stale evidence, failed/retried investigations, reevaluation
and review history, hidden approval before evaluation, explicit local test labels,
lost-response replay, scope denial and absence of financial side effects.

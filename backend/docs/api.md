# Gate frontend API — first backend slice

Base URL `http://127.0.0.1:8000/v1`. Success: `{data,meta:{traceId,mode:"sandbox",provider:"simulator"}}`. Failure: `{error:{code,message},meta:{traceId}}`. Validation errors include safe field paths. Supply `Authorization: Bearer <private credential>` with separate operator/finance identities.

Money is positive base-10 **USD cents as a string**, e.g. `"170000"` for $1,700. UUIDs come from `/catalog`; source IDs come from approved source search.

## Routes

- `GET /me`: authenticated identity/role.
- `GET /catalog`: permitted projects, agents, budgets, merchants, active policy.
- `GET /sources/search?q=...`: scoped source IDs/content search, max 50, nonexhaustive.
- `POST /policy/preview`: advisory proposal evaluation; no workflow/provider writes.
- `POST /requests`: operator/agent submits proposal; `Idempotency-Key` required.
- `GET /requests`: scoped latest 50; bounded/nonexhaustive.
- `GET /requests/:id`: evidence, decision, workflow version/status and payment.
- `GET /requests/:id/evidence`: source items and verified links.
- `POST /requests/:id/preview`: finance creates bound exact preview; key required.
- `POST /requests/:id/consent`: finance approves/rejects preview; key required.
- `POST /requests/:id/cancel`: owner/finance cancels before dispatch; key required.
- `GET /requests/:id/events`: ordered audit, max 100.
- `GET /requests/:id/explanation`: citations, policy, consent/audit facts, receipt.

Outside `/v1`, `/health` is public liveness; `/health/ready` checks database access. Neither claims native DevRev or payment-provider connectivity.

## Proposal contract

```json
{
  "agentId": "UUID_FROM_CATALOG",
  "projectId": "UUID_FROM_CATALOG",
  "merchantId": "UUID_FROM_CATALOG",
  "amountMinor": "170000",
  "currency": "USD",
  "category": "diagnostics",
  "purpose": "Proposed sandbox diagnostics for the documented issue",
  "source": { "domain": "pm", "sourceId": "ACTUAL_APPROVED_SOURCE_ID" }
}
```

Replace placeholder IDs before submitting. Categories: `diagnostics` and `incident_response`. Source domains: `pm`, `crm`, `document`. Unknown fields are rejected, including claimed permissions, evidence verification, budgets, and tenant IDs.

Request response includes `id`, `version`, `proposal`, `workflowStatus`, `decision`, `evidence`, `payment`, timestamps/mode/provider. Initial status is `AWAITING_EVIDENCE`, `AWAITING_CONSENT`, or `REJECTED`. Policy `APPROVE` is eligibility, not consent or payment.

## Finance flow

Call `/requests/:id/preview` with finance token and a logical-action key. Display returned exact proposal/destination, sandbox mode, current rules, source/policy bindings, and expiry. Response includes preview `id`, `previewHash`, `expectedVersion`.

Consent body:

```json
{
  "choice": "approve",
  "previewId": "RETURNED_PREVIEW_UUID",
  "previewHash": "RETURNED_64_CHARACTER_HASH",
  "expectedVersion": 2,
  "reason": "Reviewed the documented context and authorize the proposed sandbox purchase.",
  "reviewResolutions": ["AMOUNT_REQUIRES_REVIEW"]
}
```

Copy actual version/hash, not the example `2`. Resolve the returned human-judgment codes. Structural evidence gaps cannot be clicked through. `choice:"reject"` with a reason creates zero payments/holds.

Consent returns `AUTHORIZED` and payment ID. Poll request while worker runs. `COMPLETED` with payment `SUCCEEDED`/`CAPTURED` is a simulated receipt. `RECONCILING`/`UNKNOWN` retains funds and must not display paid or offer a new payment. Definitive `FAILED` releases its hold.

## Retries and errors

Reuse a key for retries of one action. Same key/input returns original result; different input conflicts. New preview increments request version and invalidates older previews. An idempotent replay may return an older projection; fetch current request afterward.

Codes: `UNAUTHENTICATED` 401; `FORBIDDEN` 403; `NOT_FOUND` 404 for missing/inaccessible; `STALE_PREVIEW`, `STALE_EVIDENCE`, `IDEMPOTENCY_CONFLICT`, `INVALID_STATE` 409; `POLICY_BLOCKED`, `REVIEW_UNRESOLVED`, `CONFIGURATION_UNAVAILABLE` 422. Never turn a denial into retries under new purchase keys.

Browser origin must be in `ALLOWED_ORIGINS`; wildcard and `file://` origins are disabled. Keep tokens out of frontend source, URLs, and logs. Browser finance sessions are pending: use a private authenticated development API client until then. HTTP is currently limited to 60 calls/minute per IP; tune for deployment before remote multi-user use.

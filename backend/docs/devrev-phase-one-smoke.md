# Phase 1: published agent MCP connectivity

## Verified preparation (2026-10-11)

- Render Live and local HEAD reconciled to `ee5375e1cd7384227556904eab02221f969b331d`.
- Existing async adapter: `src/devrev-trust.ts`, using `POST https://api.devrev.ai/internal/ai-agents.events.execute-async`.
- New-org PAT, supplied privately in Windows user environment `GATE_DEVREV_API_TOKEN`, validated through `dev-users.self`: HTTP 200, identity belongs to `17WZM4zcjj`. No token persisted in reports or source.
- Read-only `internal/webhooks.list`: HTTP 200. The only registered webhook was `don:integration:dvrv-us-1:devo/17WZM4zcjj:webhook/dTAew19E`, targeting Gate's production trust callback. It is forbidden for this smoke test. The trust callback can apply assessment results and reevaluate transactions.
- All three live agents **PASS**: HTTP 200 invocation, authenticated skill-triggered and skill-executed callbacks, actual matching Gate MCP sandbox response with trace ID, and authenticated final message. API-triggered runs have access to their configured Gate MCP connections for GateGetRequest.
- Temporary Cloudflare HTTPS tunnel, dedicated local callback collector, and dedicated authenticated DevRev webhook were used. Unauthenticated callback probe: HTTP 401. Authenticated challenge probe: HTTP 200. The webhook reached `active` before invocation and was deleted afterward; tunnel and collector stopped successfully.
- No production Gate deployment/configuration or transaction records were changed by this work. All observed agent tool calls were GateGetRequest. Returned state: `AWAITING_EVIDENCE`, policy `REVIEW`, consent `NONE`, authorization `NONE`, payment absent, mode `sandbox`, provider `simulator`, Gate version `0.4.1`.
- Eleven focused local verifier/collector tests passed. These tests supplement the actual execution evidence, not replace it.

## Agents and fixed request

| Agent | Agent DON | Live result / session suffix |
| --- | --- | --- |
| Purchase Authorization | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/4` | PASS / 31 |
| Risk & Fraud | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/7` | PASS / 32 |
| Approval Manager | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/8` | PASS / 33 |

Existing request: `9de772b5-4c6f-41b1-9510-46eb74ac28b9`.
Verified run: `9846af86-946b-4a3c-8e7a-4373658c24f1`, completed 2026-10-11 05:24:30 UTC.
Report stem: `backend/work/devrev-agent-smoke/9846af86-946b-4a3c-8e7a-4373658c24f1.json` (ignored by Git).
Its `.callbacks.json` contains execution evidence and final messages; `.operations.json` records callback checks, webhook activation and cleanup.

| Agent | Exact session ID | Gate MCP trace ID |
| --- | --- | --- |
| Purchase Authorization | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent_session/31` | `bbd44a00-f43b-4cfd-adc7-4e1c1a7d802a` |
| Risk & Fraud | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent_session/32` | `67adecba-441b-4660-8d75-c0758e0851cd` |
| Approval Manager | `don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent_session/33` | `c83d8307-22be-476b-bf4f-da530a7be19f` |

Each agent emitted exactly three correlated callbacks: `skill_triggered`, `skill_executed`, and final `message`. The actual DevRev skill name is `custom__gate-mcp_GateGetRequest`. Trigger arguments included the exact request ID. Successful MCP envelopes came from executed skill output, not final prose.

Earlier diagnostic runs are retained honestly: three runs returned HTTP 400 `bad_request` before webhook activation was gated; sessions 25/26/27 were accepted but lacked usable callbacks after a five-minute wait; sessions 28/29/30 completed and emitted tool callbacks, but the original verifier failed to extract output because it did not recognize the connector namespace. Those runs are not relabeled PASS. The fresh final run above captured full proof after correcting the verifier.

No Phase 1 blocker remains. Phase 1 did not implement or deploy orchestration. See [Phase 2](devrev-orchestration.md) for the subsequent coordinator implementation and its review requirements.

## Required configuration

1. Use a PAT issued in organization `17WZM4zcjj` for an identity permitted to execute the three published agents and use their configured connections. The privately supplied PAT successfully executed all three agents and their GateGetRequest connection. DevRev's reference does not specify an exact named scope for this route.
2. Provide a dedicated HTTPS callback to the isolated collector. A temporary tunnel can forward only `/callback` to loopback port 8789. This requires separate setup; the script does not open a tunnel or register webhooks automatically.
3. Register a dedicated DevRev webhook for `ai_agent_response`, configured with header `x-api-key` containing a new random secret of at least 32 characters. The collector answers DevRev's verify challenge. Never register Gate's production trust URL as the destination.
4. Privately configure `GATE_DEVREV_WEBHOOK_ID` with the new-org webhook DON and `GATE_DEVREV_WEBHOOK_SECRET` with the matching secret. Start the listener before registering/verifying the webhook and invoking agents.
5. Confirm each agent's published version includes GateGetRequest and its Gate connection. The DevRev API invocation PAT and the credential used by the MCP connection are separate authentication layers. Execute-as-user connections may require access for the invoking identity; a Playground success does not establish this.

## Repeating the isolated test (from repository root)

The authorized lifecycle runner generates an ephemeral callback secret in memory, starts the collector and portable Cloudflare tunnel, registers a dedicated webhook, waits for `active`, invokes the agents, collects evidence for up to five minutes, deletes the webhook and stops both processes in `finally`. It does not create or rotate a DevRev PAT. Download the official `cloudflared` Windows binary and verify the release checksum before use. The prepared portable executable is in the ignored work folder; it is not installed as a Windows service.

```powershell
$env:GATE_DEVREV_API_TOKEN = [Environment]::GetEnvironmentVariable('GATE_DEVREV_API_TOKEN', 'User')
node backend/scripts/devrev-agent-smoke.mjs prepare
# Use the newly printed report path; completed or uncertain runs are never retried automatically.
node backend/scripts/devrev-agent-smoke-run.mjs <new-report-path> backend/work/devrev-agent-smoke/cloudflared.exe
node backend/scripts/devrev-agent-smoke.mjs status <new-report-path>
```

This computer could not resolve newly minted tunnel hostnames immediately. The runner waits for public DNS-over-HTTPS propagation and uses that result only for callback probes, preserving normal HTTPS hostname/certificate verification. No computer DNS settings or TLS protections are changed.

## Manual collector commands

Load the three private Windows user environment values into the shell without displaying them:

```powershell
foreach ($name in @('GATE_DEVREV_API_TOKEN', 'GATE_DEVREV_WEBHOOK_ID', 'GATE_DEVREV_WEBHOOK_SECRET')) {
  [Environment]::SetEnvironmentVariable($name, [Environment]::GetEnvironmentVariable($name, 'User'), 'Process')
}
$reportPath = '<newly-prepared-report-path>'
node backend/scripts/devrev-agent-smoke.mjs listen $reportPath
```

In a second shell with the private environment loaded:

```powershell
node backend/scripts/devrev-agent-smoke.mjs invoke $reportPath
node backend/scripts/devrev-agent-smoke.mjs status $reportPath
```

Each agent gets a fresh, isolated session object and the instruction to call GateGetRequest exactly once, without `validate_decision`, other tools, handoffs, notifications or financial operations. The harness has no database connection and does not call Gate mutation endpoints. Instructions alone do not narrow the connector's existing permissions; existing Gate server authorization still applies.

The verified payload uses `target: "webhook_target"`, `webhook_target.webhook`, the published agent DON, a unique `session_object`, `event.input_message.message`, and phase/run/request correlation in `client_metadata`. Handle both the async cookbook's payload wrapper and the standard webhook event envelope. Verification challenge is nested at `verify.challenge`. Keep the production trust callback separate. The existing production adapter omits the explicit target and has a different verification parser; these are follow-up review items, not production changes in this phase.

## Evidence and stopping rule

The dispatch report captures agent IDs, HTTP results and session IDs. Its separate `.callbacks.json` records authenticated callbacks bound to run/request/agent/session, progress states, tool name, returned request statuses and MCP trace IDs. Raw tokens, request headers and full provider responses are not written.

PASS requires an accepted invocation, a final agent message, and an actual GateGetRequest `skill_executed` callback containing the matching sandbox/simulator Gate response envelope and trace ID. Final prose alone is unverified. Errors or observed Gate write tools fail. A timeout or missing callback is unknown, not success; do not automatically retry an uncertain dispatch. Allow up to five minutes, inspect status, then stop and investigate missing evidence.

Do not start orchestration until all three pass. After testing, delete the dedicated webhook and stop the temporary tunnel/listener. Preserve sanitized reports as evidence.

## Official references

- [DevRev async agent cookbook](https://developer.devrev.ai/beta/guides/agents-async-api)
- [Execute-async API](https://developer.devrev.ai/beta/api-reference/ai-agents/ai-agent-events-execute-async)
- [Authentication](https://developer.devrev.ai/about/authentication)

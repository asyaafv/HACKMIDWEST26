# Historical starter — use the TypeScript Gate backend

This folder predates the shared GateService integration. Do not start its Python
server alongside Gate or install its old three-tool contract in DevRev. Use the
canonical backend `/mcp` endpoint and [current integration flow](../docs/integration-flow.md).
The material below is historical reference, not the active setup guide.

# Gate + DevRev Computer — Phase 1

This is a **real starter implementation** for the **read-only MCP server**
and a **copy/paste skill playbook**, NOT a completed DevRev integration.

## What it includes

- `server.py`: Gate MCP Server with three tools:
  `gate_health`, `gate_evidence_checklist`, `gate_policy_preview`.
- `policy.py`: deterministic, unit-tested financial *preview* logic.
- `devrev/GATEKEEPER_REVIEW_SKILL.md`: Gatekeeper Review instructions for the Gatekeeper AI agent in DevRev Computer.
- `devrev/GUARDRAILS.md`: suggested goal, safety controls, and test prompts.
- `tests/test_policy.py`: standard-library tests without internet.

No DevRev secrets or tokens are shipped. No real money can move.

## Local setup (Windows PowerShell)

```powershell
cd gate-devrev-starter
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python server.py
```

Use `py -3.13` or `python -m venv .venv` if you do not have 3.12.
The MCP server listens at `http://127.0.0.1:8000/mcp`.

## Local setup (Mac/Linux)

```bash
cd gate-devrev-starter
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python server.py
```

## Local MCP inspection

Use MCP Inspector (if Node.js is installed):
```bash
npx @modelcontextprotocol/inspector
```

Set Transport = Streamable HTTP and URL = `http://127.0.0.1:8000/mcp`,
connect, list tools, and call `gate_health`.

**Do not open `/mcp` in a browser and expect a normal web page.** MCP is
JSON-RPC over Streamable HTTP, not a conventional GET endpoint.

## Connecting to DevRev Computer

DevRev's August 2026 release describes custom-URL MCP server installation to
an agent. Exact menu and authentication fields may differ by playground.

1. Confirm you are in your team-assigned DevRev challenge organization.
2. Open Computer / Agent Studio, typically Settings -> Agent Studio, and
   identify or create the Gatekeeper AI agent, if allowed.
3. Get our MCP server to a publicly reachable HTTPS URL protected by
   authentication **compatible with DevRev's external MCP registration**.
   Do not expose this dev server directly to the internet.
4. Add a custom MCP server using that external URL ending in `/mcp`.
5. Install/attach it to the intended Computer agent; verify that
   `gate_health` appears and returns `phase: 1-read-only`.
6. Add a reusable workflow/skill as supported by the playground. Paste and
   adapt `devrev/GATEKEEPER_REVIEW_SKILL.md` into the skill instructions or agent
   instructions. Native DevRev search/read actions must also be enabled.
7. In DevRev Computer, find real benchmark issue/ticket IDs and test a policy
   preview with those IDs; note the server does not independently fetch them.
8. Ask a second authorized teammate to repeat with a different real issue.

**Do not confuse this with `https://api.devrev.ai/mcp/v1`.** That is
DevRev's OWN MCP server for external AI clients, whereas we need our MCP
server installed inside Computer as an external tool.

## Production/security blockers before exposing over HTTPS

- Implement authenticated MCP transport using the auth mechanism supported
  by the assigned DevRev playground (OAuth preferred, if supported).
- Configure allowed external hostnames and Origin policy for the SDK's
  Streamable HTTP deployment. Default localhost host restrictions are safe
  for Phase 1 only.
- Never rely on agent-provided booleans or source IDs as verified proof.
- Build an authorized DevRev retrieval/verification pathway before calling
  enterprise evidence 'verified' inside OUR server.
- Add authenticated approver identities and atomic, one-use credential
  redemption only in later phases.

## What is and is not verified

Verified locally: policy functions and expected fail-closed cases via
`unittest`.

Not yet verified: DevRev organization access, benchmark records, custom MCP
registration, deployed HTTPS reachability, or SDK protocol interoperability
(`mcp` pip dependency installation is unavailable in the creation runtime).

## References

- DevRev August 2026 release: https://support.devrev.ai/en-US/devrev/article/NOVk-Tse-august-2026
- Agent Studio guide: https://support.devrev.ai/en-US/devrev/article/ZqvK4VT6-build-your-first-ai-agent
- Official MCP Python SDK v2: https://py.sdk.modelcontextprotocol.io/run/
- DevRev challenge: https://hackmidwest.com/
- Enterprise-Bench: https://github.com/devrev/enterprise-bench

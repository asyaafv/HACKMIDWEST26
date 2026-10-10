"""Read-only Gate MCP Server for DevRev Computer.

Requires MCP Python SDK 2.x (requirements.txt).
Phase 1 serves local Streamable HTTP at http://127.0.0.1:8000/mcp.
DO NOT expose publicly without authenticating client requests.
"""

import os
from mcp.server import MCPServer
from policy import policy_preview, evidence_checklist

mcp = MCPServer("Gate MCP Server", log_level="INFO")


@mcp.tool()
def gate_health() -> dict:
    """Check Gate MCP Server connectivity; returns no private information."""
    return {
        "service": "Gate MCP Server",
        "status": "ready",
        "phase": "1-read-only",
        "tools": [
            "gate_health", "gate_policy_preview",
            "gate_evidence_checklist",
        ],
        "live_devrev_connection": False,
        "payments_enabled": False,
    }


@mcp.tool()
def gate_evidence_checklist(
    issue_id: str = "", purchase_purpose: str = ""
) -> dict:
    """List needed Enterprise-Bench evidence and purchasing approval checks.

    This tool does NOT search DevRev itself; the invoking Computer agent must
    search records with the user's authorization and provide real citations.
    """
    return evidence_checklist(issue_id, purchase_purpose)


@mcp.tool()
def gate_policy_preview(
    request_id: str,
    amount_usd: float,
    merchant: str,
    purpose: str,
    delegated_limit_usd: float = 2000,
    merchant_allowed: bool = True,
    possible_duplicate: bool = False,
    source_ids: str = "",
) -> dict:
    """Preview purchase rules using untrusted input; NEVER authorizes a payment.

    Source IDs, duplicate claims, and merchant flags are NOT authenticated.
    Use only for simulations and ask for human approval of real purchases.
    """
    return policy_preview(
        request_id, amount_usd, merchant, purpose,
        delegated_limit_usd, merchant_allowed, possible_duplicate, source_ids
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    # Phase 1 defaults to loopback only. Do not bind 0.0.0.0 without
    # verified transport-level authentication and production host policy.
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
        json_response=True,
        stateless_http=True,
    )

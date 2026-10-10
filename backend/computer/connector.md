# Gate Computer connector

Local authenticated MCP has been tested with a real SDK client. Remote hosting, DevRev registration, and second-user Computer reuse are not yet verified.

1. Confirm isolated playground, dataset/export pin, supported connector/auth setup, and approved host with the SE.
2. Deploy API/worker/private database behind HTTPS. Set exact `MCP_ALLOWED_HOSTS` and `ALLOWED_ORIGINS`; preserve Authorization, Accept, and MCP headers.
3. Register actual `https://YOUR_HOST/mcp` with stable Gate name/slug and secure bearer connection.
4. Give each operator its own short-lived Gate credential/project grants. Keep tokens out of chats/skills.
5. Verify `gate_capabilities`, context search, and advisory preview against actual imported sources.
6. Deliberately permit reads; set `gate_request_spend` to Needs approval. That approval records a proposal, not a payment.
7. Install the `gate-spend-review` skill and inspect actual calls in a fresh conversation.
8. Finance consents through an authenticated Gate REST client until browser sessions exist; MCP exposes no finance approval.
9. Retrieve request/explanation and verify the actual simulator receipt.
10. Repeat with another authorized Computer user, separate credentials, and another source; save observed results.

Tools: `gate_capabilities`, `gate_search_context`, `gate_preview_spend`, `gate_request_spend`, `gate_get_request`, `gate_explain_request`. Proposal fields match REST camelCase; submission adds `idempotency_key`. Discovery is authoritative. Outputs above 32KB fail explicitly; use the scoped REST view instead of truncated evidence.

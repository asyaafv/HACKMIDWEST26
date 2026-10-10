import unittest

from server import mcp, gate_health, gate_evidence_checklist, gate_policy_preview


class TestServerNames(unittest.TestCase):
    def test_registered_tools_use_gate_names(self):
        self.assertEqual(
            {tool.name for tool in mcp._tool_manager.list_tools()},
            {"gate_health", "gate_evidence_checklist", "gate_policy_preview"},
        )

    def test_health_reports_gate_server_and_tools(self):
        health = gate_health()
        self.assertEqual(health["service"], "Gate MCP Server")
        self.assertEqual(set(health["tools"]), {
            "gate_health", "gate_evidence_checklist", "gate_policy_preview"
        })
        self.assertEqual(health["phase"], "1-read-only")
        self.assertFalse(health["payments_enabled"])

    def test_renamed_tools_keep_read_only_behavior(self):
        checklist = gate_evidence_checklist("ISS-123", "Monitoring")
        self.assertFalse(checklist["devrev_data_fetched"])
        preview = gate_policy_preview("REQ-001", 1800, "Demo Vendor", "Monitoring")
        self.assertEqual(preview["recommendation"], "REQUIRES_HUMAN_APPROVAL")
        self.assertFalse(preview["payment_executed"])


if __name__ == "__main__":
    unittest.main()

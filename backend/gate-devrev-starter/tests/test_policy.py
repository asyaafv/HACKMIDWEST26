import unittest

from policy import policy_preview, evidence_checklist

BASE = {
    "request_id": "REQ-001",
    "amount_usd": 1800,
    "merchant": "Demo Vendor",
    "purpose": "Investigate payment API issue",
}

class TestPolicy(unittest.TestCase):
    def test_no_auto_approval(self):
        result = policy_preview(**BASE, source_ids="ISS-123")
        self.assertEqual(result["recommendation"], "REQUIRES_HUMAN_APPROVAL")
        self.assertFalse(result["credential_issued"])
        self.assertEqual(result["evidence_status"], "UNVERIFIED_INPUT_NO_DEVREV_FETCH")

    def test_possible_duplicate(self):
        result = policy_preview(**BASE, possible_duplicate=True)
        self.assertEqual(result["recommendation"], "HOLD_FOR_DUPLICATE_REVIEW")

    def test_denied_merchant_simulation(self):
        result = policy_preview(**BASE, merchant_allowed=False)
        self.assertEqual(result["recommendation"], "DENY_UNDER_SIMULATED_POLICY")

    def test_above_limit(self):
        result = policy_preview(**{**BASE, "amount_usd": 2500})
        self.assertEqual(result["recommendation"], "REQUIRES_HUMAN_APPROVAL")

    def test_reject_fraction_cent(self):
        with self.assertRaises(ValueError):
            policy_preview(**{**BASE, "amount_usd": 1.001})

    def test_reject_negative(self):
        with self.assertRaises(ValueError):
            policy_preview(**{**BASE, "amount_usd": -100})

    def test_reject_nan(self):
        with self.assertRaises(ValueError):
            policy_preview(**{**BASE, "amount_usd": float("nan")})

    def test_checklist_is_not_fetch(self):
        result = evidence_checklist("ISS-123")
        self.assertFalse(result["devrev_data_fetched"])

if __name__ == "__main__":
    unittest.main()

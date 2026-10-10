"""Deterministic, read-only financial POLICY PREVIEW (not payment authorization).

All values supplied through the MCP client, including alleged evidence/approvals,
must be considered unverified. This module never issues credentials or approvals.
"""

from decimal import Decimal, InvalidOperation

def as_money(value) -> Decimal:
    """Convert string/number to exact USD cents with validation."""
    if isinstance(value, bool):
        raise ValueError("Amount must be numeric.")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("Amount must be numeric.") from None
    if not amount.is_finite() or amount <= 0:
        raise ValueError("Amount must be finite and greater than zero.")
    if amount != amount.quantize(Decimal("0.01")):
        raise ValueError("USD amount cannot contain fractions of a cent.")
    return amount


def policy_preview(
    request_id: str,
    amount_usd: float,
    merchant: str,
    purpose: str,
    delegated_limit_usd: float = 2000,
    merchant_allowed: bool = True,
    possible_duplicate: bool = False,
    source_ids: str = "",
) -> dict:
    """Evaluate *claims* supplied by a client, without trusting them as verified facts."""
    amount = as_money(amount_usd)
    limit = as_money(delegated_limit_usd)
    if not request_id.strip() or not merchant.strip() or not purpose.strip():
        raise ValueError("request_id, merchant and purpose are required.")
    if len(request_id) > 100 or len(merchant) > 200 or len(purpose) > 1000:
        raise ValueError("Input text exceeds demo maximum length.")
    ids = [x.strip() for x in source_ids.split(",") if x.strip()]
    if len(ids) > 20 or any(len(x) > 128 for x in ids):
        raise ValueError("Too many or overly long source IDs.")

    checks = {
        "amount_within_demo_delegated_limit": amount <= limit,
        "merchant_allowed_claim": bool(merchant_allowed),
        "possible_duplicate_claim": bool(possible_duplicate),
        "enterprise_evidence_source_ids_supplied": bool(ids),
    }
    if not merchant_allowed:
        recommendation = "DENY_UNDER_SIMULATED_POLICY"
        reason = "Proposed merchant is not allowed under the *simulated* input policy."
    elif possible_duplicate:
        recommendation = "HOLD_FOR_DUPLICATE_REVIEW"
        reason = "Input flags a possible duplicate; verify against authoritative ledger."
    elif amount > limit:
        recommendation = "REQUIRES_HUMAN_APPROVAL"
        reason = "Amount exceeds the simulated delegated limit."
    else:
        recommendation = "REQUIRES_HUMAN_APPROVAL"
        reason = "Preliminary policy checks pass; no verified purchasing approval exists."

    # A transparent, *non-probabilistic* heuristic, for display only.
    over_limit = min(1.0, max(0.0, float(amount / limit - 1)))
    score = round(100 * (
        0.35 * float(bool(possible_duplicate)) +
        0.25 * float(not bool(merchant_allowed)) +
        0.20 * over_limit +
        0.20 * float(not bool(ids))
    ))
    return {
        "request_id": request_id,
        "mode": "READ_ONLY_SANDBOX_PREVIEW",
        "recommendation": recommendation,
        "reason": reason,
        "request": {"amount_usd": str(amount), "merchant": merchant, "purpose": purpose},
        "checks": checks,
        "claimed_source_ids": ids,
        "evidence_status": "UNVERIFIED_INPUT_NO_DEVREV_FETCH",
        "financial_approval_status": "NOT_VERIFIED",
        "illustrative_risk_index_0_to_100": score,
        "risk_index_is_fraud_probability": False,
        "payment_executed": False,
        "credential_issued": False,
        "next_action": "Verify Enterprise-Bench records and independent human approval before authorization.",
    }


def evidence_checklist(issue_id: str = "", purchase_purpose: str = "") -> dict:
    """Return the evidence requirements without implying any live retrieval."""
    return {
        "mode": "READ_ONLY_CHECKLIST",
        "issue_id_claim": issue_id,
        "purchase_purpose": purchase_purpose,
        "devrev_data_fetched": False,
        "enterprise_evidence_to_retrieve": [
            "Real Enterprise-Bench issue ID, title, state and source URL",
            "Related support tickets and product component, if any",
            "Documented link between business need and proposed item",
        ],
        "separate_financial_controls_to_verify": [
            "Requester identity and spending authority",
            "Allowed merchant and purchase category",
            "Delegated spending limit and budget",
            "Authoritative prior-transaction ledger for duplicates",
            "Specific human approval if required",
        ],
        "rule": "A ticket proving a problem exists does not prove a purchase is approved.",
    }

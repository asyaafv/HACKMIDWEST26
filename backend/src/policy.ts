/** Pure eligibility rules: hard denials win; summed risk points are not probabilities. */
import type { Proposal } from "./contracts.js";
import { hash } from "./hash.js";

export const POLICY = Object.freeze({
  version: "gate-policy-v1", automaticMaxMinor: "50000", dailyMaxMinor: "1000000",
  dailyMaxRequests: 10, reviewScoreThreshold: 40, ttlSeconds: 300,
});
export interface PolicyInput {
  proposal: Proposal;
  agentActive: boolean;
  agentCapMinor: string;
  merchantStatus: "ALLOWED" | "REVIEW" | "DENIED";
  budgetAvailableMinor: string;
  dailyUsedMinor: string;
  dailyCount: number;
  evidenceComplete: boolean;
}
export function evaluate(input: PolicyInput) {
  const amount = BigInt(input.proposal.amountMinor);
  const rules: { code: string; result: "PASS" | "FAIL" | "UNKNOWN"; severity: "HARD_DENY" | "REVIEW"; actual?: string; threshold?: string }[] = [];
  const factors: { code: string; points: number }[] = [];
  const reviews: { code: string; resolution: "HUMAN_JUDGMENT" | "NEW_EVIDENCE" }[] = [];
  const hard = (code: string, pass: boolean, actual?: string, threshold?: string) =>
    rules.push({ code, result: pass ? "PASS" : "FAIL", severity: "HARD_DENY", actual, threshold });
  hard("AGENT_ACTIVE", input.agentActive);
  hard("AGENT_REQUEST_CAP", amount <= BigInt(input.agentCapMinor), input.proposal.amountMinor, input.agentCapMinor);
  hard("MERCHANT_ALLOWED", input.merchantStatus !== "DENIED", input.merchantStatus);
  hard("BUDGET_AVAILABLE", amount <= BigInt(input.budgetAvailableMinor), input.proposal.amountMinor, input.budgetAvailableMinor);
  hard("DAILY_AMOUNT_CAP", amount + BigInt(input.dailyUsedMinor) <= BigInt(POLICY.dailyMaxMinor));
  hard("DAILY_COUNT_CAP", input.dailyCount < POLICY.dailyMaxRequests);
  if (amount > BigInt(POLICY.automaticMaxMinor)) {
    reviews.push({ code: "AMOUNT_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" });
    factors.push({ code: "AMOUNT", points: amount > 200000n ? 35 : 20 });
  }
  if (input.merchantStatus === "REVIEW") {
    reviews.push({ code: "MERCHANT_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" });
    factors.push({ code: "MERCHANT", points: 25 });
  }
  if (!input.evidenceComplete) {
    reviews.push({ code: "REQUIRED_EVIDENCE_MISSING", resolution: "NEW_EVIDENCE" });
    factors.push({ code: "EVIDENCE", points: 30 });
  }
  const riskScore = Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0));
  if (riskScore >= POLICY.reviewScoreThreshold && !reviews.some(r => r.resolution === "NEW_EVIDENCE")) {
    reviews.push({ code: "RISK_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" });
  }
  const denied = rules.some(r => r.result === "FAIL");
  return {
    verdict: denied ? "REJECT" as const : reviews.length ? "REVIEW" as const : "APPROVE" as const,
    riskScore, factors, rules, reviewRequirements: reviews,
    executionAllowed: !denied && input.evidenceComplete,
    requiresHumanConsent: true as const, policyVersion: POLICY.version,
    policyHash: hash(POLICY), inputHash: hash(input),
  };
}

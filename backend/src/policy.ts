/** Gate Contextual Spend Risk (GCSR): deterministic review points, never a fraud probability. */
import type { Proposal } from "./contracts.js";
import { TRUST_MODEL } from "./trust-contracts.js";
import { hash } from "./hash.js";

export const RISK_ALGORITHM = Object.freeze({
  name: "Gate Contextual Spend Risk", code: "GCSR", version: 1,
  amountHighMinor: "200000", budgetPressurePercent: 80, dailyPressurePercent: 80,
  points: Object.freeze({ amountModerate: 20, amountHigh: 35, merchantReview: 25,
    missingEvidence: 30, duplicateIntent: 20, contradictoryEvidence: 35,
    budgetPressure: 20, dailyPressure: 25 }),
});
export const POLICY = Object.freeze({
  version: "gate-policy-v4", automaticMaxMinor: "100000", dailyMaxMinor: "1000000",
  dailyMaxRequests: 10, reviewScoreThreshold: 40, ttlSeconds: 300,
  riskModel: {
    version: "gate-risk-v2", scoreType: "RULE_POINTS" as const, maximum: 100, largeAmountMinor: "200000",
    factors: {
      amount: { label: "Amount above automatic review limit", points: 20 },
      largeAmount: { label: "Amount above large purchase limit", points: 35 },
      merchant: { label: "Merchant requires review", points: 25 },
      missingEvidence: { label: "Required evidence missing", points: 30 },
      duplicate: { label: "Duplicate business intent", points: 20 },
      contradiction: { label: "Contradictory evidence", points: 35 },
    },
  },
  riskAlgorithm: RISK_ALGORITHM,
  trustModel: TRUST_MODEL,
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
  duplicateIntent?: boolean;
  contradictoryEvidence?: boolean;
  trust?: {status:"PENDING"|"COMPLETED"|"FAILED"; adjustment:number; unresolved:boolean};
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
    factors.push({ code: "AMOUNT", points: amount > BigInt(RISK_ALGORITHM.amountHighMinor) ? RISK_ALGORITHM.points.amountHigh : RISK_ALGORITHM.points.amountModerate });
  }
  if (input.merchantStatus === "REVIEW") {
    reviews.push({ code: "MERCHANT_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" });
    factors.push({ code: "MERCHANT", points: RISK_ALGORITHM.points.merchantReview });
  }
  if (!input.evidenceComplete) {
    reviews.push({ code: "REQUIRED_EVIDENCE_MISSING", resolution: "NEW_EVIDENCE" });
    factors.push({ code: "EVIDENCE", points: RISK_ALGORITHM.points.missingEvidence });
  }
  if (input.duplicateIntent) {
    reviews.push({ code: "DUPLICATE_BUSINESS_INTENT", resolution: "HUMAN_JUDGMENT" });
    factors.push({ code: "DUPLICATE_INTENT", points: RISK_ALGORITHM.points.duplicateIntent });
  }
  if (input.contradictoryEvidence) {
    reviews.push({ code: "CONTRADICTORY_REQUIRED_EVIDENCE", resolution: "NEW_EVIDENCE" });
    factors.push({ code: "CONTRADICTION", points: RISK_ALGORITHM.points.contradictoryEvidence });
  }
  const available = BigInt(input.budgetAvailableMinor);
  if (available > 0n && amount * 100n >= available * BigInt(RISK_ALGORITHM.budgetPressurePercent)) {
    factors.push({ code: "BUDGET_PRESSURE", points: RISK_ALGORITHM.points.budgetPressure });
  }
  if ((BigInt(input.dailyUsedMinor) + amount) * 100n >= BigInt(POLICY.dailyMaxMinor) * BigInt(RISK_ALGORITHM.dailyPressurePercent)) {
    factors.push({ code: "DAILY_PRESSURE", points: RISK_ALGORITHM.points.dailyPressure });
  }
  if (input.trust) {
    if (input.trust.status === "PENDING") reviews.push({code:"TRUST_ASSESSMENT_PENDING",resolution:"NEW_EVIDENCE"});
    else if (input.trust.status === "FAILED" || input.trust.unresolved) reviews.push({code:"TRUST_ASSESSMENT_REQUIRES_REVIEW",resolution:"HUMAN_JUDGMENT"});
    if (input.trust.status === "COMPLETED") factors.push({code:"TRUST_HISTORY",points:Math.max(TRUST_MODEL.minimum,Math.min(TRUST_MODEL.maximum,input.trust.adjustment))});
  }
  const riskScore = Math.max(0, Math.min(POLICY.riskModel.maximum, factors.reduce((sum, factor) => sum + factor.points, 0)));
  if (riskScore >= POLICY.reviewScoreThreshold && !reviews.some(r => r.resolution === "NEW_EVIDENCE")) {
    reviews.push({ code: "RISK_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" });
  }
  const denied = rules.some(r => r.result === "FAIL");
  const verdict = denied ? "REJECT" as const : reviews.length ? "REVIEW" as const : "APPROVE" as const;
  const riskAssessment = {
    computedBy: "BACKEND_POLICY" as const, modelVersion: POLICY.riskModel.version,
    scoreType: POLICY.riskModel.scoreType, score: riskScore, maximum: POLICY.riskModel.maximum,
    reviewThreshold: POLICY.reviewScoreThreshold,
    level: denied ? "BLOCKED" as const : reviews.length ? "REVIEW_REQUIRED" as const : "LOW" as const,
    lowRisk: verdict === "APPROVE",
    summary: denied ? "Rejected by a hard policy rule." : reviews.length ? "Review required: " + reviews.map(r => r.code.replaceAll("_", " ").toLowerCase()).join(", ") + "."
      : "Low risk: all policy checks pass and required evidence is complete. Eligible for automatic sandbox authorization.",
  };
  return {
    verdict, riskAssessment, riskScore, riskAlgorithm: RISK_ALGORITHM.name, factors, rules, reviewRequirements: reviews,
    executionAllowed: !denied && input.evidenceComplete && !input.contradictoryEvidence && input.trust?.status !== "PENDING",
    requiresHumanConsent: !denied && reviews.some(r => r.resolution === "HUMAN_JUDGMENT"), policyVersion: POLICY.version,
    policyHash: hash(POLICY), inputHash: hash(input),
  };
}

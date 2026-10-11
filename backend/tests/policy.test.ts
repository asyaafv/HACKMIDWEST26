/** Boundary tests prove eligibility and missing evidence never become spending consent. */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluate, RISK_ALGORITHM, type PolicyInput } from "../src/policy.js";
import { proposalSchema } from "../src/contracts.js";
import { hash } from "../src/hash.js";
import { verifyChain } from "../src/audit.js";

function input(amount = "50000"): PolicyInput {
  return { proposal: { agentId: randomUUID(), projectId: randomUUID(), merchantId: randomUUID(), amountMinor: amount,
    currency: "USD", category: "diagnostics", purpose: "Unit test only", source: { domain: "pm", sourceId: "UNIT-1" } },
    agentActive: true, agentCapMinor: "500000", merchantStatus: "ALLOWED", budgetAvailableMinor: "1000000",
    dailyUsedMinor: "0", dailyCount: 0, evidenceComplete: true };
}
describe("deterministic policy", () => {
  it("reviews one cent above the automatic threshold", () => {
    expect(evaluate(input("100000")).verdict).toBe("APPROVE");
    expect(evaluate(input("100001")).verdict).toBe("REVIEW");
    expect(evaluate(input()).requiresHumanConsent).toBe(false);
  });
  it("returns an explicit backend approval recommendation for complete low-risk evidence", () => {
    expect(evaluate(input("20000"))).toMatchObject({ verdict: "APPROVE", riskScore: 0, requiresHumanConsent: false,
      riskAssessment: { computedBy: "BACKEND_POLICY", scoreType: "RULE_POINTS", level: "LOW", lowRisk: true } });
    const denied = input("20000"); denied.merchantStatus = "DENIED";
    expect(evaluate(denied)).toMatchObject({ verdict: "REJECT", riskScore: 0,
      riskAssessment: { level: "BLOCKED", lowRisk: false } });
  });
  it("denies one cent above the agent cap regardless of low risk", () => {
    expect(evaluate(input("500000")).verdict).toBe("REVIEW");
    expect(evaluate(input("500001")).verdict).toBe("REJECT");
  });
  it("accepts exactly remaining budget and rejects one cent over", () => {
    const value = input("10000"); value.budgetAvailableMinor = "10000";
    expect(evaluate(value).verdict).toBe("APPROVE");
    value.proposal.amountMinor = "10001";
    expect(evaluate(value).verdict).toBe("REJECT");
  });
  it("missing evidence cannot execute even below threshold", () => {
    const value = input(); value.evidenceComplete = false;
    expect(evaluate(value)).toMatchObject({ verdict: "REVIEW", executionAllowed: false });
  });
  it("names and exposes the exact additive risk factors", () => {
    const value = input("170000"); value.merchantStatus = "REVIEW"; value.duplicateIntent = true;
    const decision = evaluate(value);
    expect(decision.riskAlgorithm).toBe(RISK_ALGORITHM.name);
    expect(decision.factors).toEqual([
      { code: "AMOUNT", points: 20 }, { code: "MERCHANT", points: 25 }, { code: "DUPLICATE_INTENT", points: 20 },
    ]);
    expect(decision.riskScore).toBe(65);
    expect(decision.reviewRequirements).toContainEqual({ code: "RISK_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" });
  });
  it("requires human review when budget and daily pressure combine above 40 points", () => {
    const value = input("40000"); value.budgetAvailableMinor = "50000"; value.dailyUsedMinor = "760000";
    const decision = evaluate(value);
    expect(decision.factors).toEqual([
      { code: "BUDGET_PRESSURE", points: 20 }, { code: "DAILY_PRESSURE", points: 25 },
    ]);
    expect(decision).toMatchObject({ riskScore: 45, verdict: "REVIEW", executionAllowed: true });
    expect(decision.reviewRequirements).toEqual([{ code: "RISK_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" }]);
    value.dailyUsedMinor = "759999";
    expect(evaluate(value).riskScore).toBe(20);
    expect(evaluate(value).verdict).toBe("APPROVE");
  });
  it("missing or contradictory evidence blocks execution even with high risk points", () => {
    const value = input("300000"); value.evidenceComplete = false; value.contradictoryEvidence = true;
    const decision = evaluate(value);
    expect(decision.riskScore).toBe(100);
    expect(decision).toMatchObject({ verdict: "REVIEW", executionAllowed: false });
    expect(decision.reviewRequirements).not.toContainEqual({ code: "RISK_REQUIRES_REVIEW", resolution: "HUMAN_JUDGMENT" });
  });
  it("denied merchant and disabled agent are hard failures", () => {
    const value = input(); value.merchantStatus = "DENIED";
    expect(evaluate(value).verdict).toBe("REJECT");
    value.merchantStatus = "ALLOWED"; value.agentActive = false;
    expect(evaluate(value).verdict).toBe("REJECT");
  });
  it("enforces daily count and amount inclusive of held payments", () => {
    const value = input(); value.dailyCount = 10;
    expect(evaluate(value).verdict).toBe("REJECT");
    value.dailyCount = 0; value.dailyUsedMinor = "950001";
    expect(evaluate(value).verdict).toBe("REJECT");
  });
  it("replays identically and ignores object key ordering", () => {
    const value = input(); expect(evaluate(value)).toEqual(evaluate(structuredClone(value)));
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
    expect(hash({ a: 1, missing: undefined })).toBe(hash({ a: 1 }));
  });
  it.each(["0", "-1", "1.5", "1e3", "NaN", "001", "999999999", 100, null])("rejects invalid cents %s", amount => {
    expect(proposalSchema.safeParse({ ...input().proposal, amountMinor: amount }).success).toBe(false);
  });
  it("rejects unsupported currency and caller-invented verification flags", () => {
    expect(proposalSchema.safeParse({ ...input().proposal, currency: "EUR" }).success).toBe(false);
    expect(proposalSchema.safeParse({ ...input().proposal, evidenceVerified: true }).success).toBe(false);
  });
  it("detects altered audit packet or head", () => {
    const packet = { sequence: "1", event: "unit.test" };
    const eventHash = hash({ packet, prevHash: "GENESIS" });
    const rows = [{ sequence: "1", packet, prev_hash: "GENESIS", event_hash: eventHash }];
    expect(verifyChain(rows, eventHash)).toBe(true);
    expect(verifyChain(rows, "altered")).toBe(false);
    packet.event = "tampered"; expect(verifyChain(rows, eventHash)).toBe(false);
  });
});

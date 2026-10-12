/** DevRev findings can add risk and require review; they can never reduce Gate's score or authority. */
import { z } from 'zod';
import { hash } from './hash.js';

export const AGENT_RISK_RULES = Object.freeze({
  FRAUD_INDICATOR: { factor: 'DEVREV_FRAUD_INDICATOR', label: 'DevRev flagged a potential fraud indicator', points: 30 },
  EVIDENCE_CONTRADICTION: { factor: 'DEVREV_EVIDENCE_CONTRADICTION', label: 'DevRev flagged contradictory evidence', points: 25 },
  DUPLICATE_INTENT: { factor: 'DEVREV_DUPLICATE_INTENT', label: 'DevRev flagged a possible duplicate request', points: 20 },
  PURPOSE_SOURCE_MISMATCH: { factor: 'DEVREV_PURPOSE_SOURCE_MISMATCH', label: 'DevRev flagged a purpose and source mismatch', points: 20 },
  POLICY_BYPASS_ATTEMPT: { factor: 'DEVREV_POLICY_BYPASS_ATTEMPT', label: 'DevRev flagged a possible policy bypass', points: 30 },
} as const);

export const agentRiskSignalSchema = z.object({
  code: z.enum(Object.keys(AGENT_RISK_RULES) as [keyof typeof AGENT_RISK_RULES, ...(keyof typeof AGENT_RISK_RULES)[]]),
  references: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
  summary: z.string().trim().min(1).max(500),
}).strict();
export type AgentRiskSignal = z.infer<typeof agentRiskSignalSchema>;
export type AgentReviewState = {
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  runId?: string;
  reviewedVersion?: number;
  evidenceHash?: string;
  sourceHash?: string;
  signals: (AgentRiskSignal & { agentId?: string; stage?: number })[];
  errorCode?: string;
};

const agentRequirements = new Set([
  'DEVREV_AGENT_REVIEW_PENDING', 'DEVREV_AGENT_REVIEW_FAILED',
  ...Object.keys(AGENT_RISK_RULES).map(code => `DEVREV_SIGNAL_${code}`),
]);

/** Apply only backend-owned weights. Signals and failures can hold/escalate, never approve or lower risk. */
export function applyAgentReview<T extends {
  verdict: 'APPROVE' | 'REVIEW' | 'REJECT'; riskScore: number;
  factors: { code: string; points: number }[];
  reviewRequirements: { code: string; resolution: string }[];
  executionAllowed: boolean; requiresHumanConsent: boolean;
  riskAssessment: { score: number; level: 'LOW' | 'REVIEW_REQUIRED' | 'BLOCKED'; lowRisk: boolean; summary: string; reviewThreshold: number };
  inputHash?: string; policyHash?: string;
}>(decision: T, review: AgentReviewState): T & { agentReview: AgentReviewState } {
  const signals = review.status === 'PENDING' ? [] : review.signals;
  const unique = [...new Set(signals.map(signal => signal.code))];
  const additions = unique.map(code => ({ code: AGENT_RISK_RULES[code].factor, points: AGENT_RISK_RULES[code].points }));
  const riskScore = Math.min(100, decision.riskScore + additions.reduce((sum, factor) => sum + factor.points, 0));
  const reviewRequirements = decision.reviewRequirements.filter(item => !agentRequirements.has(item.code));
  if (review.status === 'PENDING') reviewRequirements.push({ code: 'DEVREV_AGENT_REVIEW_PENDING', resolution: 'AGENT_REVIEW' });
  if (review.status === 'FAILED') reviewRequirements.push({ code: 'DEVREV_AGENT_REVIEW_FAILED', resolution: 'HUMAN_JUDGMENT' });
  for (const code of unique) reviewRequirements.push({ code: `DEVREV_SIGNAL_${code}`, resolution: 'HUMAN_JUDGMENT' });
  const verdict = decision.verdict === 'REJECT' ? 'REJECT' : reviewRequirements.length || riskScore >= decision.riskAssessment.reviewThreshold ? 'REVIEW' : 'APPROVE';
  const summary = review.status === 'PENDING' ? 'Waiting for the three required DevRev agent reviews.'
    : review.status === 'FAILED' ? 'DevRev review did not complete. An independent human review is required.'
    : unique.length ? `${decision.riskAssessment.summary} DevRev advisory flags: ${unique.map(code => code.replaceAll('_', ' ').toLowerCase()).join(', ')}.`
    : decision.riskAssessment.summary;
  return {
    ...decision,
    verdict,
    riskScore,
    factors: [...decision.factors, ...additions],
    reviewRequirements,
    executionAllowed: decision.executionAllowed && review.status !== 'PENDING',
    requiresHumanConsent: decision.requiresHumanConsent || review.status === 'FAILED' || unique.length > 0,
    riskAssessment: {
      ...decision.riskAssessment,
      score: riskScore,
      level: verdict === 'REJECT' ? 'BLOCKED' : verdict === 'REVIEW' ? 'REVIEW_REQUIRED' : 'LOW',
      lowRisk: verdict === 'APPROVE',
      summary,
    },
    inputHash: decision.inputHash ? hash({ base: decision.inputHash, review: { status: review.status, signals: unique } }) : undefined,
    agentReview: review,
  };
}

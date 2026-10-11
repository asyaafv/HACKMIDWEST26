import type { Transaction } from './types';

const requirementText: Record<string,string> = {
  AMOUNT_REQUIRES_REVIEW: 'This amount is above the automatic review limit and needs an authorized finance decision.',
  MERCHANT_REQUIRES_REVIEW: 'This vendor needs additional finance review.',
  REQUIRED_EVIDENCE_MISSING: 'Required supporting evidence is missing.',
  CONTRADICTORY_REQUIRED_EVIDENCE: 'Supporting business records conflict. Resolve the conflict before approval or payment.',
  DUPLICATE_BUSINESS_INTENT: 'Gate found a similar request that may represent the same purchase.',
  TRUST_ASSESSMENT_PENDING: 'The vendor trust check is still in progress.',
  TRUST_ASSESSMENT_REQUIRES_REVIEW: 'The vendor trust review needs a human decision.',
  RISK_REQUIRES_REVIEW: 'The policy risk score requires a finance review.',
};

const failedRuleText: Record<string,string> = {
  AGENT_ACTIVE: 'The assigned Gatekeeper is inactive.',
  AGENT_REQUEST_CAP: 'The amount is above the Gatekeeper’s request limit.',
  MERCHANT_ALLOWED: 'This vendor is not approved for this purchase.',
  BUDGET_AVAILABLE: 'There is not enough available project budget.',
  DAILY_AMOUNT_CAP: 'This request would exceed the daily spending limit.',
  DAILY_COUNT_CAP: 'The daily request limit has been reached.',
};

function unique(values: string[]) { return [...new Set(values)]; }

export function requirementExplanation(code: string) {
  return requirementText[code] ?? 'This request needs additional review under the current policy.';
}

export function decisionExplanation(transaction: Transaction) {
  if (transaction.decision === 'Blocked' && transaction.reason?.trim()) {
    return `A finance reviewer rejected this request: ${transaction.reason.trim()}`;
  }
  const failures=unique(transaction.checks.filter(check=>!check.passed)
    .map(check=>failedRuleText[check.name.toUpperCase().replaceAll(' ','_')])
    .filter((value):value is string=>!!value));
  if (failures.length) return `Gate blocked this request. ${failures.join(' ')}`;

  const requirements=unique((transaction.reviewRequirements??[]).map(item=>item.code)
    .filter(code=>requirementText[code]).map(requirementExplanation));
  if (requirements.some(text=>text.includes('Supporting business records conflict'))) {
    const remaining=requirements.filter(text=>!text.includes('Supporting business records conflict'));
    return `Gate flagged this request because supporting business records conflict. ${remaining.join(' ')}`.trim();
  }
  if (requirements.length) return `Gate flagged this request. ${requirements.join(' ')}`;
  if (transaction.policyVerdict === 'APPROVE') return 'Gate found no outstanding policy or evidence issues in this request.';
  if (transaction.policyVerdict === 'REJECT') return 'Gate blocked this request under a hard policy check. Open review details for the specific rule.';
  return 'Gate flagged this request for additional review based on its policy checks and supporting evidence.';
}

export function approvalRequirementText(transaction: Transaction) {
  const unresolved=new Set((transaction.reviewRequirements??[]).map(item=>item.code));
  const evidenceRequired=(transaction.reviewRequirements??[]).some(item=>item.resolution==='NEW_EVIDENCE');
  const messages=unique([...unresolved].map(requirementExplanation));
  if (transaction.workflowStatus === 'AWAITING_EVIDENCE' || evidenceRequired || transaction.executionAllowed === false) {
    return messages.length ? `Approval is unavailable. ${messages.join(' ')}` : 'Approval is unavailable until the required evidence checks are resolved.';
  }
  return transaction.approvalBlockReason ?? 'This request does not meet the current approval requirements.';
}

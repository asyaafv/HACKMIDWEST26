import { expect, it } from 'vitest';
import { seed } from '../../src/data';
import { approvalRequirementText, decisionExplanation, requirementExplanation } from '../../src/risk-explanation';
import { hasCompletedPurchase, transactionStatusLabel } from '../../src/transaction-presentation';

function flaggedRequest() {
  const transaction=seed().transactions[0];
  transaction.decision='Pending';transaction.risk=85;transaction.workflowStatus='AWAITING_EVIDENCE';transaction.policyVerdict='REVIEW';transaction.executionAllowed=false;transaction.requiresHumanConsent=true;
  transaction.reviewRequirements=[
    {code:'AMOUNT_REQUIRES_REVIEW',resolution:'HUMAN_JUDGMENT'},
    {code:'REQUIRED_EVIDENCE_MISSING',resolution:'NEW_EVIDENCE'},
    {code:'CONTRADICTORY_REQUIRED_EVIDENCE',resolution:'NEW_EVIDENCE'},
  ];
  transaction.historicalPayment=null;
  return transaction;
}

it('explains contradictory and missing evidence in finance-friendly language',()=>{
  const transaction=flaggedRequest();
  const explanation=decisionExplanation(transaction),blocked=approvalRequirementText(transaction);
  expect(explanation).toContain('supporting business records conflict');
  expect(explanation).toContain('Required supporting evidence is missing.');
  expect(explanation).not.toMatch(/CONTRADICTORY|required_evidence/i);
  expect(blocked).toContain('Approval is unavailable.');
  expect(blocked).toContain('Resolve the conflict before approval or payment.');
  expect(transactionStatusLabel(transaction)).toBe('Evidence needed');
});

it('calls an authorized human review an approval, not a completed purchase',()=>{
  const transaction=flaggedRequest();
  transaction.workflowStatus='AUTHORIZED';transaction.authorizationStatus='REVIEWED';transaction.decision='Approved';transaction.policyVerdict='REVIEW';
  expect(transactionStatusLabel(transaction)).toBe('Approved');
  expect(hasCompletedPurchase(transaction)).toBe(false);
});

it('explains DevRev findings and holds in the existing review fields',()=>{
  expect(requirementExplanation('DEVREV_AGENT_REVIEW_PENDING')).toContain('still running');
  expect(requirementExplanation('DEVREV_SIGNAL_FRAUD_INDICATOR')).toContain('independent human decision');
  expect(requirementExplanation('DEVREV_SIGNAL_POLICY_BYPASS_ATTEMPT')).toContain('bypass policy');
});

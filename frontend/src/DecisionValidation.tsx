/** Current policy validation is requested from Gate; the browser never calculates risk. */
import { useEffect, useRef, useState } from 'react';
import { api } from './backend-service';
import { useDemo } from './context';
import { dateLabel } from './data';
import type { RiskAssessment, Transaction } from './types';

interface Validation {
  requestId:string;requestVersion:number;checkedAt:string;status:'VALID'|'CHANGED';reasons:string[];
  storedDecision:{verdict:string;riskScore:number};
  decision:{verdict:string;riskScore:number;riskAssessment:RiskAssessment;factors:{code:string;points:number}[];reviewRequirements:{code:string;resolution:string}[]};
  evidence:{complete:boolean;sourceCount:number;unresolvedRequirements:string[]};
  policy:{version:string;automaticMaxMinor:string;reviewScoreThreshold:number;riskModel:{version:string;scoreType:string;maximum:number;largeAmountMinor:string;factors:Record<string,{label:string;points:number}>}};
}

export function DecisionValidation({transaction}:{transaction:Transaction}) {
  const {busy}=useDemo();
  const [checking,setChecking]=useState(false),[result,setResult]=useState<Validation|null>(null),[error,setError]=useState('');
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function validate() {
    setChecking(true);setError('');setResult(null);
    try {
      const next=await api.call<Validation>(`/demo/transactions/${transaction.id}/validation`);
      if(!mounted.current)return;
      if(next.requestVersion!==transaction.reviewBinding?.version)throw new Error('This request changed. Refresh its details and validate again.');
      setResult(next);
    } catch(e) { if(mounted.current)setError(e instanceof Error?e.message:'Decision validation failed.'); }
    finally { if(mounted.current)setChecking(false); }
  }
  return <section className="transaction-details" aria-label="Decision validation">
    <h3>Validate decision</h3>
    <p>Check the saved decision against current evidence, duplicate requests, budget and backend policy.</p>
    <button type="button" className="button" disabled={busy||checking} onClick={()=>{void validate();}}>{checking?'Validating…':'Validate decision'}</button>
    {error&&<p role="alert">{error}</p>}
    {result&&<div role="status" aria-live="polite">
      <h4>{result.status==='VALID'?'Saved decision matches current backend checks':'Saved decision needs reevaluation'}</h4>
      <p><strong>Current recommendation: {result.decision.verdict}</strong> · {result.decision.riskAssessment.level.replaceAll('_',' ')} · {result.decision.riskAssessment.score}/{result.decision.riskAssessment.maximum} risk points</p>
      <p>{result.decision.riskAssessment.summary}</p>
      {result.status==='CHANGED'&&<><p>Saved recommendation: {result.storedDecision.verdict} · {result.storedDecision.riskScore} risk points.</p><ul>{result.reasons.map(reason=><li key={reason}>{reason.replaceAll('_',' ')}</li>)}</ul><p>Run an investigation or recheck the evidence to save a new evaluation before reviewing it.</p></>}
      <p>{result.evidence.sourceCount} verified source records · {result.evidence.complete?'Evidence complete':'Evidence incomplete'} · Checked {dateLabel(result.checkedAt)}</p>
      {result.evidence.unresolvedRequirements.length>0&&<ul>{result.evidence.unresolvedRequirements.map((item,i)=><li key={`${item}:${i}`}>{item.replaceAll('_',' ')}</li>)}</ul>}
      <ul>{result.decision.factors.map(factor=><li key={factor.code}>{factor.code.replaceAll('_',' ')}: +{factor.points} points</li>)}</ul>
      <details><summary>Backend risk algorithm</summary>
        <p>Model {result.policy.riskModel.version} · Policy {result.policy.version}. The backend sums triggered rule points up to {result.policy.riskModel.maximum}. The score is not a probability.</p>
        <p>Automatic amount limit: {result.policy.automaticMaxMinor} USD cents. Large purchase limit: {result.policy.riskModel.largeAmountMinor} USD cents. Score review threshold: {result.policy.reviewScoreThreshold} points. Hard failures and individual review rules override a low score.</p>
        <ul>{Object.entries(result.policy.riskModel.factors).map(([key,factor])=><li key={key}>{factor.label}: {factor.points} points</li>)}</ul>
      </details>
    </div>}
  </section>;
}

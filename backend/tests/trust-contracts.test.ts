import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { configuration } from '../src/config.js';
import { validateTrustResponse,type TrustInput } from '../src/trust-contracts.js';
import { evaluate,type PolicyInput } from '../src/policy.js';

const agentId=randomUUID(),merchantId=randomUUID();
const input:TrustInput={requestId:randomUUID(),agentId,dataLabel:'GATE_STORED_HISTORY',purchaseDataLabel:'SYNTHETIC_DEMO_DATA',referenceTime:new Date().toISOString(),
 purchase:{agentId,merchantId,projectId:randomUUID(),amountMinor:'10000',currency:'USD',category:'diagnostics',purpose:'Synthetic test',source:{domain:'pm',sourceId:'test'}},
 history:Array.from({length:3},()=>({transactionId:randomUUID(),agentId,merchantId,category:'diagnostics',amountMinor:'10000',currency:'USD',outcome:'SUCCEEDED',
  legitimacyReview:'CONFIRMED_LEGITIMATE',createdAt:new Date().toISOString(),dataLabel:'SYNTHETIC_DEMO_DATA'}))};
const response={requestId:input.requestId,assessmentStatus:'SUFFICIENT',dataLabel:'GATE_STORED_HISTORY',signals:[{code:'ESTABLISHED_REVIEWED_PATTERN',direction:'DECREASE',
 supportingTransactionIds:input.history.map(h=>h.transactionId),explanation:'Explicitly reviewed comparable history'}],unresolvedQuestions:[]};
const policy:PolicyInput={proposal:input.purchase,agentActive:true,agentCapMinor:'500000',merchantStatus:'ALLOWED',budgetAvailableMinor:'1000000',dailyUsedMinor:'0',dailyCount:0,evidenceComplete:true};
it('allows a bounded decrease only for three verified legitimate transactions, never success alone',()=>{
 expect(validateTrustResponse(response,input).adjustment).toBe(-10);
 expect(()=>validateTrustResponse(response,{...input,history:input.history.map(h=>({...h,legitimacyReview:'UNREVIEWED'}))})).toThrow('UNSUPPORTED_SIGNAL');
 expect(()=>validateTrustResponse({...response,signals:[{...response.signals[0],supportingTransactionIds:[randomUUID()]}]},input)).toThrow('UNVERIFIED_CITATION');
 expect(()=>validateTrustResponse({...response,signals:[response.signals[0],response.signals[0]]},input)).toThrow('DUPLICATE_SIGNAL');
});
it('does not trust agent points, wrong directions, fabricated requests or example citations',()=>{
 expect(()=>validateTrustResponse({...response,riskAdjustment:-99},input)).toThrow();
 expect(()=>validateTrustResponse({...response,requestId:randomUUID()},input)).toThrow('REQUEST_MISMATCH');
 expect(()=>validateTrustResponse({...response,signals:[{...response.signals[0],direction:'INCREASE'}]},input)).toThrow('DIRECTION_MISMATCH');
 expect(()=>validateTrustResponse({...response,assessmentStatus:'INSUFFICIENT_HISTORY'},input)).toThrow('INSUFFICIENT_HISTORY_SIGNALS');
});
it('increases risk on verified amount and category anomalies',()=>{
 const purchase={...input.purchase,amountMinor:'90000',category:'incident_response' as const};
 const unfamiliar={code:'UNFAMILIAR_CATEGORY',direction:'INCREASE',supportingTransactionIds:input.history.map(h=>h.transactionId),explanation:'Different category'};
 const unseen=validateTrustResponse({...response,signals:[unfamiliar]},{...input,purchase});expect(unseen.adjustment).toBe(10);
 const large={...input,purchase:{...input.purchase,amountMinor:'90000'}};
 expect(validateTrustResponse({...response,signals:[{...unfamiliar,code:'UNUSUAL_AMOUNT'}]},large).adjustment).toBe(20);
});
it('holds automatic authorization while pending, requires review on failure, and never reduces mandatory rules',()=>{
 expect(evaluate({...policy,trust:{status:'PENDING',adjustment:0,unresolved:false}})).toMatchObject({verdict:'REVIEW',executionAllowed:false});
 expect(evaluate({...policy,trust:{status:'FAILED',adjustment:0,unresolved:false}})).toMatchObject({verdict:'REVIEW',requiresHumanConsent:true});
 const trust={status:'COMPLETED' as const,adjustment:-10,unresolved:false};
 expect(evaluate({...policy,trust})).toMatchObject({verdict:'APPROVE',riskScore:0});
 expect(evaluate({...policy,trust,proposal:{...input.purchase,amountMinor:'100001'}})).toMatchObject({verdict:'REVIEW',requiresHumanConsent:true});
 expect(evaluate({...policy,trust,duplicateIntent:true})).toMatchObject({verdict:'REVIEW',requiresHumanConsent:true});
 expect(evaluate({...policy,trust,merchantStatus:'DENIED'})).toMatchObject({verdict:'REJECT',executionAllowed:false});
 expect(evaluate({...policy,trust:{...trust,unresolved:true}})).toMatchObject({verdict:'REVIEW',requiresHumanConsent:true});
});
it('defaults to disabled and refuses incomplete activation without exposing secrets',()=>{
 const env={DATABASE_URL:'postgresql://example/test',DEVREV_API_TOKEN:'private-test-token',DEVREV_TRUST_AGENT_ID:'don:core:dvrv-us-1:devo/test:ai_agent/6'};
 expect(configuration(env).DEVREV_TRUST_ENABLED).toBe(false);
 expect(()=>configuration({...env,DEVREV_TRUST_ENABLED:'true'})).toThrow();
});

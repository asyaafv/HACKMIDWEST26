/** Agent suggestions are validated against the frozen, tenant-scoped history snapshot. */
import { z } from 'zod';
import type { Proposal } from './contracts.js';

export const TRUST_MODEL = Object.freeze({version:'gate-trust-v1', minimum:-10, maximum:30,
 weights:{ESTABLISHED_REVIEWED_PATTERN:-10,UNUSUAL_AMOUNT:20,UNFAMILIAR_MERCHANT:10,UNFAMILIAR_CATEGORY:10,REPEATED_PURCHASE_ATTEMPT:20}});
export interface TrustHistory {
 transactionId:string; agentId:string; merchantId:string; category:string; amountMinor:string;
 currency:'USD'; outcome:string; legitimacyReview:'UNREVIEWED'|'CONFIRMED_LEGITIMATE'|'CONFIRMED_FRAUD';
 createdAt:string; dataLabel:'SYNTHETIC_DEMO_DATA'|'GATE_STORED_HISTORY';
}
export interface TrustInput {requestId:string; agentId:string; dataLabel:'GATE_STORED_HISTORY'; purchase:Proposal; purchaseDataLabel:'SYNTHETIC_DEMO_DATA'|'GATE_STORED_HISTORY'; history:TrustHistory[]; referenceTime:string}
const codes = ['ESTABLISHED_REVIEWED_PATTERN','UNUSUAL_AMOUNT','UNFAMILIAR_MERCHANT','UNFAMILIAR_CATEGORY','REPEATED_PURCHASE_ATTEMPT'] as const;
export const trustResponseSchema = z.object({
 requestId:z.string().uuid(), assessmentStatus:z.enum(['SUFFICIENT','INSUFFICIENT_HISTORY']),
 dataLabel:z.literal('GATE_STORED_HISTORY'),
 signals:z.array(z.object({code:z.enum(codes),direction:z.enum(['INCREASE','DECREASE']),
  supportingTransactionIds:z.array(z.string().uuid()).min(1).max(50),explanation:z.string().min(1).max(1000)}).strict()).max(5),
 unresolvedQuestions:z.array(z.string().min(1).max(1000)).max(10),
}).strict();
export type TrustResponse = z.infer<typeof trustResponseSchema>;
export function validateTrustResponse(raw:unknown,input:TrustInput) {
 const response=trustResponseSchema.parse(raw);
 if(response.requestId!==input.requestId)throw new Error('REQUEST_MISMATCH');
 if(response.assessmentStatus==='INSUFFICIENT_HISTORY'&&response.signals.length)throw new Error('INSUFFICIENT_HISTORY_SIGNALS');
 const seen=new Set<string>();let adjustment=0;
 const amount=BigInt(input.purchase.amountMinor);
 for(const signal of response.signals){
  if(seen.has(signal.code))throw new Error('DUPLICATE_SIGNAL');seen.add(signal.code);
  const ids=new Set(signal.supportingTransactionIds);
  if(ids.size!==signal.supportingTransactionIds.length)throw new Error('DUPLICATE_CITATION');
  const cited=input.history.filter(h=>ids.has(h.transactionId));
  if(cited.length!==ids.size||cited.some(h=>h.agentId!==input.agentId||h.currency!=='USD'))throw new Error('UNVERIFIED_CITATION');
  const matching=cited.filter(h=>h.merchantId===input.purchase.merchantId&&h.category===input.purchase.category);
  const weight=TRUST_MODEL.weights[signal.code];
  if(signal.direction!==(weight<0?'DECREASE':'INCREASE'))throw new Error('DIRECTION_MISMATCH');
  const maximum=matching.reduce((a,h)=>BigInt(h.amountMinor)>a?BigInt(h.amountMinor):a,0n);
  let supported=false;
  switch(signal.code){
   case 'ESTABLISHED_REVIEWED_PATTERN': supported=!input.history.some(h=>h.merchantId===input.purchase.merchantId&&h.category===input.purchase.category&&h.legitimacyReview==='CONFIRMED_FRAUD')&&matching.length===cited.length&&matching.length>=3&&matching.every(h=>h.legitimacyReview==='CONFIRMED_LEGITIMATE')&&amount*2n<=maximum*3n;break;
   case 'UNUSUAL_AMOUNT': {const allMaximum=input.history.filter(h=>h.merchantId===input.purchase.merchantId&&h.category===input.purchase.category).reduce((a,h)=>BigInt(h.amountMinor)>a?BigInt(h.amountMinor):a,0n);supported=maximum>0n&&amount>allMaximum*3n;break;}
   case 'UNFAMILIAR_MERCHANT': supported=cited.length>=3&&!input.history.some(h=>h.merchantId===input.purchase.merchantId);break;
   case 'UNFAMILIAR_CATEGORY': supported=cited.length>=3&&!input.history.some(h=>h.category===input.purchase.category);break;
   case 'REPEATED_PURCHASE_ATTEMPT': supported=cited.some(h=>h.merchantId===input.purchase.merchantId&&h.category===input.purchase.category&&h.amountMinor===input.purchase.amountMinor&&Date.parse(h.createdAt)<=Date.parse(input.referenceTime)&&Date.parse(h.createdAt)>=Date.parse(input.referenceTime)-600000);break;
  }
  if(!supported)throw new Error('UNSUPPORTED_SIGNAL');
  adjustment+=weight;
 }
 return {response,adjustment:Math.max(TRUST_MODEL.minimum,Math.min(TRUST_MODEL.maximum,adjustment))};
}

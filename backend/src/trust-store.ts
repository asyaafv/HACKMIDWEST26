/** Durable history snapshots contain only the purchasing agent's project and no credentials. */
import { randomUUID } from 'node:crypto';
import type { Tx } from './db.js';
import type { Principal } from './contracts.js';
import type { TrustInput } from './trust-contracts.js';
import { hash } from './hash.js';
import { appendAudit } from './audit.js';
import { z } from 'zod';
import { transaction,type DB } from './db.js';
import { projectAccess,roleAccess } from './auth.js';
import { requireThat } from './errors.js';
import { idempotent } from './idempotency.js';

export async function queueTrust(tx:Tx,p:Principal,row:any,timeoutSeconds:number) {
 const records=(await tx.query(`SELECT r.id,r.agent_id,r.merchant_id,r.amount_minor,r.proposal,r.evidence,r.origin,r.created_at,
   COALESCE(pay.status,r.status) AS outcome,l.legitimacy
   FROM requests r LEFT JOIN payments pay ON pay.org_id=r.org_id AND pay.request_id=r.id
   LEFT JOIN trust_history_labels l ON l.org_id=r.org_id AND l.request_id=r.id
   WHERE r.org_id=$1 AND r.agent_id=$2 AND r.project_id=$3 AND r.id<>$4
   ORDER BY r.created_at DESC,r.id DESC LIMIT 50`,[p.orgId,row.agent_id,row.project_id,row.id])).rows;
 const input:TrustInput={requestId:row.id,agentId:row.agent_id,dataLabel:'GATE_STORED_HISTORY',
  purchase:row.proposal,purchaseDataLabel:row.origin==='SIMULATED_PURCHASE'||row.evidence.items.some((item:any)=>item.datasetVersion?.includes('SYNTHETIC_DEMO_DATA'))?'SYNTHETIC_DEMO_DATA':'GATE_STORED_HISTORY',referenceTime:new Date().toISOString(),history:records.map(r=>({
   transactionId:r.id,agentId:r.agent_id,merchantId:r.merchant_id,category:r.proposal.category,
   currency:r.proposal.currency,amountMinor:r.amount_minor,outcome:r.outcome,
   legitimacyReview:r.legitimacy??'UNREVIEWED',createdAt:r.created_at.toISOString(),
   dataLabel:r.origin==='SIMULATED_PURCHASE'||r.evidence.items.some((item:any)=>item.datasetVersion?.includes('SYNTHETIC_DEMO_DATA'))?'SYNTHETIC_DEMO_DATA':'GATE_STORED_HISTORY',
  }))};
 const id=randomUUID();
 await tx.query(`INSERT INTO trust_assessments(id,org_id,request_id,input,input_hash,proposal_hash,status,expires_at)
  VALUES($1,$2,$3,$4,$5,$6,'QUEUED',now()+($7*interval '1 second'))`,[id,p.orgId,row.id,input,hash(input),hash(row.proposal),timeoutSeconds]);
 await appendAudit(tx,p.orgId,p.id,'trust.queued',row.id,{assessmentId:id,inputHash:hash(input),historyCount:records.length});
}
export async function trustForRequest(tx:Tx,orgId:string,requestId:string) {
 const row=(await tx.query(`SELECT r.trust_required,t.status,t.adjustment,t.response,t.expires_at
  FROM requests r LEFT JOIN trust_assessments t ON t.org_id=r.org_id AND t.request_id=r.id
  WHERE r.org_id=$1 AND r.id=$2`,[orgId,requestId])).rows[0];
 if(!row?.trust_required)return undefined;
 if(row.status==='COMPLETED')return {status:'COMPLETED' as const,adjustment:row.adjustment,
  unresolved:!!row.response?.unresolvedQuestions?.length};
 if(['QUEUED','SENT'].includes(row.status)&&new Date(row.expires_at).getTime()>Date.now())return {status:'PENDING' as const,adjustment:0,unresolved:false};
 return {status:'FAILED' as const,adjustment:0,unresolved:false};
}

/** Legitimacy is an explicit independent human label, never inferred from payment success. */
export async function labelTrustHistory(db:DB,p:Principal,id:string,input:unknown,key:string) {
 roleAccess(p,['FINANCE']);
 const body=z.object({legitimacy:z.enum(['CONFIRMED_LEGITIMATE','CONFIRMED_FRAUD']),reason:z.string().trim().min(1).max(1000)}).strict().parse(input);
 return transaction(db,p.orgId,tx=>idempotent(tx,p,'trust.label',key,{id,...body},async()=>{
  const row=(await tx.query('SELECT * FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE',[p.orgId,id])).rows[0];
  requireThat(row,'NOT_FOUND','Transaction not found.',404);await projectAccess(tx,p,row.project_id);
  requireThat(row.created_by!==p.id,'SELF_APPROVAL','Independent history reviewer required.',403);
  const payment=(await tx.query('SELECT status FROM payments WHERE org_id=$1 AND request_id=$2',[p.orgId,id])).rows[0];
  requireThat(body.legitimacy==='CONFIRMED_LEGITIMATE'?payment?.status==='SUCCEEDED':['COMPLETED','FAILED','REJECTED','CANCELLED','EXPIRED'].includes(row.status),
   'INVALID_STATE','Review a settled transaction before labeling history.',409);
  requireThat(!(await tx.query('SELECT 1 FROM trust_history_labels WHERE org_id=$1 AND request_id=$2',[p.orgId,id])).rowCount,
   'ALREADY_LABELED','History already has an immutable review label.',409);
  await tx.query('INSERT INTO trust_history_labels(org_id,request_id,actor_id,legitimacy,reason) VALUES($1,$2,$3,$4,$5)',[p.orgId,id,p.id,body.legitimacy,body.reason]);
  await appendAudit(tx,p.orgId,p.id,'trust.history_labeled',id,body);
  return {requestId:id,...body};
 }));
}

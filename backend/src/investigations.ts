/** Durable, scoped Gatekeeper leases validate cited evidence and archive each deterministic reevaluation. */
import { randomUUID } from 'node:crypto';
import { transaction,type DB,type Tx } from './db.js';
import type { Principal } from './contracts.js';
import type { GateService } from './service.js';
import { projectAccess } from './auth.js';
import { capabilityAccess } from './capabilities.js';
import { requireThat,GateError } from './errors.js';
import { collectEvidence } from './evidence.js';
import { hash } from './hash.js';
import { appendAudit } from './audit.js';
import { idempotent } from './idempotency.js';
import { startInvestigationSchema,submitEvidenceSchema,failInvestigationSchema } from './investigation-contracts.js';

export class Investigations {
 constructor(private db:DB,private service:GateService){}
 private access(p:Principal,local:boolean) {
  if(local) requireThat(p.role==='FINANCE','FORBIDDEN','Shared demo reviewer required.',403);
  else {capabilityAccess(p,'investigation:write');requireThat(p.role==='AGENT','FORBIDDEN','Gatekeeper identity required.',403);}
 }
 private async request(tx:Tx,p:Principal,id:string) {
  const row=(await tx.query('SELECT * FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE',[p.orgId,id])).rows[0];
  requireThat(row,'NOT_FOUND','Proposal not found.',404);await projectAccess(tx,p,row.project_id);return row;
 }
 private async noFinancialExecution(tx:Tx,p:Principal,id:string) {
  requireThat(!(await tx.query('SELECT 1 FROM payments WHERE org_id=$1 AND request_id=$2',[p.orgId,id])).rowCount,
   'HISTORICAL_PAYMENT','Investigations cannot rewrite a request linked to a payment.',409);
 }
 async start(p:Principal,id:string,input:unknown,key:string,local=false) {
  this.access(p,local);const body=startInvestigationSchema.parse(input);
  return transaction(this.db,p.orgId,tx=>idempotent(tx,p,'investigation.start',key,{id,...body,local},async()=>{
   const row=await this.request(tx,p,id);await this.noFinancialExecution(tx,p,id);
   requireThat(row.version===body.expectedVersion,'STALE_REQUEST','Proposal changed. Refresh first.',409);
   await tx.query("INSERT INTO investigations(org_id,request_id,status) VALUES($1,$2,'WAITING') ON CONFLICT DO NOTHING",[p.orgId,id]);
   const current=(await tx.query('SELECT * FROM investigations WHERE org_id=$1 AND request_id=$2 FOR UPDATE',[p.orgId,id])).rows[0];
   requireThat(current.status!=='INVESTIGATING'||new Date(current.lease_until).getTime()<=Date.now(),
    'INVESTIGATION_BUSY','A Gatekeeper is already investigating this proposal.',409);
   const result=(await tx.query(`UPDATE investigations SET status='INVESTIGATING',version=version+1,run_id=$3,actor_id=$4,mode=$5,
    request_version=$6,lease_until=now()+interval '10 minutes',started_at=now(),evidence_received_at=NULL,evaluated_at=NULL,
    failed_at=NULL,failure_reason=NULL WHERE org_id=$1 AND request_id=$2 RETURNING *`,[p.orgId,id,randomUUID(),p.id,local?'LOCAL_TEST':'GATEKEEPER',row.version])).rows[0];
   await appendAudit(tx,p.orgId,p.id,'investigation.started',id,{runId:result.run_id,mode:result.mode,expectedVersion:row.version});return result;
  }));
 }
 private async claim(tx:Tx,p:Principal,id:string,body:{runId:string;expectedVersion:number},local:boolean) {
  const row=await this.request(tx,p,id);await this.noFinancialExecution(tx,p,id);
  const inv=(await tx.query('SELECT * FROM investigations WHERE org_id=$1 AND request_id=$2 FOR UPDATE',[p.orgId,id])).rows[0];
  requireThat(inv&&inv.status==='INVESTIGATING'&&inv.run_id===body.runId&&inv.actor_id===p.id&&inv.mode===(local?'LOCAL_TEST':'GATEKEEPER'),
   'STALE_INVESTIGATION','This investigation is no longer assigned to this caller.',409);
  requireThat(row.version===body.expectedVersion&&inv.request_version===body.expectedVersion,'STALE_REQUEST','Proposal changed. Refresh first.',409);
  requireThat(new Date(inv.lease_until).getTime()>Date.now(),'INVESTIGATION_EXPIRED','Investigation lease expired; claim it again.',409);
  return {row,inv};
 }
 async submit(p:Principal,id:string,input:unknown,key:string,local=false) {
  this.access(p,local);const body=submitEvidenceSchema.parse(input);
  return transaction(this.db,p.orgId,tx=>idempotent(tx,p,'investigation.submit',key,{id,...body,local},async()=>{
   const {row,inv}=await this.claim(tx,p,id,body,local);
   const bundle=await collectEvidence(tx,p,row.proposal);
   // Claim text cannot invent a citation, relationship or source revision.
   requireThat(body.report.sources.some(s=>s.domain===row.proposal.source.domain&&s.sourceId===row.proposal.source.sourceId),
    'PRIMARY_CITATION_REQUIRED','Include the proposal’s primary source.',422);
   for(const reference of body.report.sources){
    const source=bundle.items.find(s=>s.domain===reference.domain&&s.sourceId===reference.sourceId);
    requireThat(source&&source.sourceHash===reference.sourceHash&&source.contentHash===reference.contentHash,
     'STALE_SOURCE','A cited source is unavailable, changed or outside the verified context.',409);
   }
   const edges=new Set(bundle.links.map(hash));
   requireThat(body.report.links.every(link=>edges.has(hash(link))),'UNVERIFIED_RELATIONSHIP','A reported relationship is not verified by the source records.',422);
   const evidence={...bundle,complete:bundle.complete&&!body.report.unresolvedQuestions.length,
    unresolvedRequirements:[...bundle.unresolvedRequirements,...body.report.unresolvedQuestions.map((_,i)=>`GATEKEEPER_QUESTION_${i+1}`)],
    investigation:{runId:inv.run_id,actorId:p.id,mode:inv.mode,report:body.report}};
   evidence.bundleHash=hash({...evidence,bundleHash:undefined});
   await tx.query("UPDATE investigations SET status='EVIDENCE_RECEIVED',version=version+1,evidence_received_at=now() WHERE org_id=$1 AND request_id=$2",[p.orgId,id]);
   await appendAudit(tx,p.orgId,p.id,'investigation.evidence_received',id,{runId:inv.run_id,sources:body.report.sources,unresolvedQuestions:body.report.unresolvedQuestions});
   const decision=await this.service.evaluateInvestigation(tx,p,row,evidence),version=row.version+1;
   const status=decision.verdict==='REJECT'?'REJECTED':evidence.complete&&!decision.reviewRequirements.some(r=>r.resolution==='NEW_EVIDENCE')?'AWAITING_CONSENT':'AWAITING_EVIDENCE';
   await tx.query('UPDATE requests SET evidence=$3,decision=$4,status=$5,version=$6 WHERE org_id=$1 AND id=$2',[p.orgId,id,evidence,decision,status,version]);
   await tx.query('INSERT INTO request_revisions(id,org_id,request_id,revision,proposal,proposal_hash,evidence,evidence_hash,decision,decision_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [randomUUID(),p.orgId,id,version,row.proposal,hash(row.proposal),evidence,hash(evidence),decision,hash(decision)]);
   await tx.query('INSERT INTO investigation_reports(id,org_id,request_id,run_id,actor_id,mode,request_version,report) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),p.orgId,id,inv.run_id,p.id,inv.mode,version,body.report]);
   const result=(await tx.query("UPDATE investigations SET status='EVALUATED',version=version+1,evaluated_at=now(),lease_until=NULL WHERE org_id=$1 AND request_id=$2 RETURNING *",[p.orgId,id])).rows[0];
   await appendAudit(tx,p.orgId,p.id,'investigation.evaluated',id,{runId:inv.run_id,requestVersion:version,verdict:decision.verdict,riskScore:decision.riskScore,evidenceHash:evidence.bundleHash});
   const automatic = await this.service.authorizeLowRisk(tx,p,{...row,evidence,decision,version});
   return {investigation:result,requestVersion:version,decision,paymentExecution:automatic};
  }));
 }
 async fail(p:Principal,id:string,input:unknown,key:string,local=false) {
  this.access(p,local);const body=failInvestigationSchema.parse(input);
  return transaction(this.db,p.orgId,tx=>idempotent(tx,p,'investigation.fail',key,{id,...body,local},async()=>{
   await this.claim(tx,p,id,body,local);
   const result=(await tx.query("UPDATE investigations SET status='FAILED',version=version+1,failure_reason=$3,failed_at=now(),lease_until=NULL WHERE org_id=$1 AND request_id=$2 RETURNING *",[p.orgId,id,body.reason])).rows[0];
   await appendAudit(tx,p.orgId,p.id,'investigation.failed',id,{runId:body.runId,reason:body.reason});return result;
  }));
 }
 async list(p:Principal,limit=20) {
  this.access(p,false);
  return transaction(this.db,p.orgId,async tx=>({items:(await tx.query(`SELECT i.*,r.project_id,r.agent_id,r.version AS current_request_version FROM investigations i
   JOIN requests r ON r.org_id=i.org_id AND r.id=i.request_id JOIN principal_projects g ON g.org_id=r.org_id AND g.project_id=r.project_id
   WHERE i.org_id=$1 AND g.principal_id=$2 AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.org_id=r.org_id AND p.request_id=r.id) AND (i.status IN ('WAITING','FAILED') OR (i.status='INVESTIGATING' AND i.lease_until<=now()))
   ORDER BY i.created_at,i.request_id LIMIT $3`,[p.orgId,p.id,limit])).rows,limit,exhaustive:false}));
 }
 async localRun(p:Principal,id:string,input:unknown,key:string) {
  const body=startInvestigationSchema.parse(input),started=await this.start(p,id,body,`${key}:start`,true);
  const current=await this.service.get(p,id);
  if(current.investigation?.run_id===started.run_id&&['EVALUATED','FAILED'].includes(current.investigation.status))return current;
  try {
   const bundle=await transaction(this.db,p.orgId,tx=>collectEvidence(tx,p,current.proposal));
   requireThat(bundle.items.length,'SOURCE_UNAVAILABLE','The primary source is unavailable. Import supporting evidence before retrying.',422);
   await this.submit(p,id,{...body,runId:started.run_id,report:{sources:bundle.items.map(s=>({domain:s.domain,sourceId:s.sourceId,sourceHash:s.sourceHash,contentHash:s.contentHash})),links:bundle.links,unresolvedQuestions:[]}},`${key}:submit`,true);
  }catch(error){
   await this.fail(p,id,{...body,runId:started.run_id,reason:error instanceof GateError?error.message:'Local evidence evaluation failed. Check imported evidence and retry.'},`${key}:fail`,true);
  }
  return this.service.get(p,id);
 }
}

/** One dispatch per durable assessment; crashes and missing callbacks resolve to manual review. */
import { z } from 'zod';
import type { DB,Tx } from './db.js';
import { transaction } from './db.js';
import type { GateService } from './service.js';
import { DevRevTrustClient,type DevRevTrustSettings } from './devrev-trust.js';
import { validateTrustResponse } from './trust-contracts.js';
import { hash } from './hash.js';
import { appendAudit } from './audit.js';
import { requireThat } from './errors.js';

const eventSchema=z.object({agent:z.string(),agent_response:z.enum(['progress','message','error']),session_object:z.string(),
 client_metadata:z.object({orgId:z.string().uuid(),requestId:z.string().uuid(),assessmentId:z.string().uuid(),inputHash:z.string().regex(/^[a-f0-9]{64}$/)}),
 message:z.string().max(16000).optional()});
export class TrustWorker {
 private client:DevRevTrustClient;
 constructor(private db:DB,private service:GateService,private settings:DevRevTrustSettings,transport:typeof fetch=fetch){this.client=new DevRevTrustClient(settings,transport);}
 private async finish(tx:Tx,assessment:any,status:'COMPLETED'|'FAILED'|'TIMED_OUT',response:unknown=null,adjustment=0,failureCode:string|null=null) {
  // All writers lock request before assessment, matching finance and cancellation paths.
  const row=(await tx.query('SELECT * FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE',[assessment.org_id,assessment.request_id])).rows[0];
  const current=(await tx.query('SELECT * FROM trust_assessments WHERE org_id=$1 AND id=$2 FOR UPDATE',[assessment.org_id,assessment.id])).rows[0];
  if(!current||!['QUEUED','SENT'].includes(current.status))return {processed:false};
  const eligible=['AWAITING_EVIDENCE','AWAITING_CONSENT'].includes(row.status)&&hash(row.proposal)===current.proposal_hash
   &&!(await tx.query('SELECT 1 FROM payments WHERE org_id=$1 AND request_id=$2',[assessment.org_id,row.id])).rowCount;
  if(!eligible){status='FAILED';failureCode='STALE_REQUEST';response=null;adjustment=0;}
  await tx.query('UPDATE trust_assessments SET status=$3,response=$4,adjustment=$5,failure_code=$6,completed_at=now() WHERE org_id=$1 AND id=$2',
   [assessment.org_id,assessment.id,status,response,adjustment,failureCode]);
  await appendAudit(tx,assessment.org_id,null,'trust.result',row.id,{assessmentId:assessment.id,status,adjustment,failureCode});
  if(eligible)await this.service.applyTrustResult(tx,assessment.org_id,row);
  return {processed:true};
 }
 async runOnce() {
  const orgs=(await this.db.query('SELECT * FROM gate_trust_pending_orgs()')).rows;
  for(const {org_id:orgId} of orgs){
   const expired=await transaction(this.db,orgId,async tx=>(await tx.query("SELECT * FROM trust_assessments WHERE org_id=$1 AND status IN ('QUEUED','SENT') AND expires_at<=now() ORDER BY created_at LIMIT 1",[orgId])).rows[0]);
   if(expired){await transaction(this.db,orgId,tx=>this.finish(tx,expired,'TIMED_OUT',null,0,'DEVREV_TIMEOUT'));return true;}
   if(!this.settings.enabled)continue;
   const assessment=await transaction(this.db,orgId,async tx=>(await tx.query(`UPDATE trust_assessments SET status='SENT' WHERE id=(SELECT id FROM trust_assessments
    WHERE org_id=$1 AND status='QUEUED' AND expires_at>now() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) AND org_id=$1 RETURNING *`,[orgId])).rows[0]);
   if(!assessment)continue;
   try {await this.client.execute(assessment);}
   catch {await transaction(this.db,orgId,tx=>this.finish(tx,assessment,'FAILED',null,0,'DEVREV_API_UNAVAILABLE'));}
   return true;
  }
  return false;
 }
 async receive(raw:unknown) {
  const envelope=z.object({payload:z.object({ai_agent_response:eventSchema})}).parse(raw);
  const event=envelope.payload.ai_agent_response,metadata=event.client_metadata;
  requireThat(event.agent===this.settings.agentId&&event.session_object===`gate-trust:${metadata.assessmentId}`,'INVALID_TRUST_EVENT','Agent event binding mismatch.',409);
  return transaction(this.db,metadata.orgId,async tx=>{
   const row=(await tx.query('SELECT * FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE',[metadata.orgId,metadata.requestId])).rows[0];
   const assessment=(await tx.query('SELECT * FROM trust_assessments WHERE org_id=$1 AND id=$2 AND request_id=$3 FOR UPDATE',[metadata.orgId,metadata.assessmentId,metadata.requestId])).rows[0];
   requireThat(row&&assessment&&assessment.input_hash===metadata.inputHash,'INVALID_TRUST_EVENT','Assessment event binding mismatch.',409);
   if(assessment.status!=='SENT')return {processed:false};
   if(new Date(assessment.expires_at).getTime()<=Date.now())return this.finish(tx,assessment,'TIMED_OUT',null,0,'DEVREV_TIMEOUT');
   if(event.agent_response==='progress')return {processed:false};
   if(event.agent_response==='error')return this.finish(tx,assessment,'FAILED',null,0,'DEVREV_AGENT_ERROR');
   let validated:ReturnType<typeof validateTrustResponse>;
   try {validated=validateTrustResponse(JSON.parse(event.message??''),assessment.input);}
   catch {return this.finish(tx,assessment,'FAILED',null,0,'INVALID_AGENT_RESPONSE');}
   return this.finish(tx,assessment,'COMPLETED',validated.response,validated.adjustment);
  });
 }
}

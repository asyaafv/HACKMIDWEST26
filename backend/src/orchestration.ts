/** Durable coordinator for real DevRev runs. Writes only its own advisory tables. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DB,Tx } from './db.js';
import { transaction } from './db.js';
import type { Principal } from './contracts.js';
import { keySchema } from './contracts.js';
import { requestRow } from './service.js';
import type { GateService } from './service.js';
import { capabilityAccess } from './capabilities.js';
import { requireThat } from './errors.js';
import { hash } from './hash.js';
import { agentEvent,canonicalTool,gateEnvelopes,invocationPayload,dispatchAsync,scrub } from './devrev-async.mjs';
import { AGENT_IDS,DEVREV_ORG,factsFromRequest,needsHuman,stageMessage,validateFinal,escalationDraft,type OrchestrationSettings } from './orchestration-contracts.js';

const metadataSchema=z.object({phase:z.literal('gate-orchestration-2'),orgId:z.string().uuid(),requestId:z.string().uuid(),
 runId:z.string().uuid(),stageId:z.string().uuid(),ordinal:z.number().int().min(1).max(3),promptHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const eventSchema=z.object({agent:z.string().max(200),session:z.string().regex(/^don:core:dvrv-us-1:devo\/17WZM4zcjj:ai_agent_session\/[^:]+$/),
 session_object:z.string().max(200),client_metadata:metadataSchema,agent_response:z.enum(['progress','message','error']),
 message:z.string().max(16000).optional(),error:z.object({error:z.string().max(2000)}).optional(),
 progress:z.object({progress_state:z.enum(['skill_triggered','skill_executed']),
  skill_triggered:z.object({skill_name:z.string().max(200),args:z.record(z.string(),z.unknown()).optional()}).optional(),
  skill_executed:z.object({skill_name:z.string().max(200),output:z.unknown()}).optional()}).optional()});
const terminal=new Set(['SUCCEEDED','FAILED','TIMED_OUT']);
export class OrchestrationCoordinator {
 constructor(private db:DB,private service:GateService,private settings:OrchestrationSettings,private transport:typeof fetch=fetch){}
 private access(p:Principal) {
  capabilityAccess(p,'request:read');
  requireThat(p.orgId===this.settings.gateOrgId,'NOT_FOUND','Orchestration not available for this organization.',404);
 }
 private async connectionReady(stage:any) {
  const identity=await this.transport('https://api.devrev.ai/dev-users.self',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${this.settings.apiToken}`}});
  requireThat(identity.ok,'DEVREV_TOKEN_REJECTED','DevRev API identity validation failed.',409);
  const user=(await identity.json() as any).dev_user;
  requireThat(user?.id?.includes(`:devo/${DEVREV_ORG}:devu/`),'DEVREV_WRONG_ORG','DevRev token belongs to another organization.',409);
  const response=await this.transport('https://api.devrev.ai/internal/webhooks.get',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Authorization:`Bearer ${this.settings.apiToken}`,'Content-Type':'application/json'},body:JSON.stringify({id:this.settings.webhookId})});
  const webhook=response.ok?(await response.json() as any).webhook:null;
  requireThat(webhook?.id===this.settings.webhookId&&webhook.status==='active'&&webhook.url?.startsWith('https://')&&webhook.url?.endsWith('/v1/integrations/devrev/orchestration/webhook'),
   'DEVREV_WEBHOOK_NOT_READY','Dedicated active orchestration webhook required.',409);
  const agentResponse=await this.transport('https://api.devrev.ai/internal/ai-agents.get',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Authorization:`Bearer ${this.settings.apiToken}`,'Content-Type':'application/json'},body:JSON.stringify({id:stage.agent_id})});
  const agent=agentResponse.ok?(await agentResponse.json() as any).agent:null;
  // The verified get API exposes the published default, not historical-version inspection.
  // Fail closed after republishing until the operator reviews and updates the pin.
  requireThat(agent?.id===stage.agent_id&&agent.default_version_id?.id===stage.agent_version&&Array.isArray(agent.skills)
   &&agent.skills.length===1&&agent.skills[0]?.name==='GateGetRequest',
   'SAFE_AGENT_VERSION_REQUIRED','Pinned published default must expose only GateGetRequest.',409);
 }
 async start(p:Principal,requestId:string,key:string,retryOf?:string) {
  this.access(p);keySchema.parse(key);
  requireThat(['OPERATOR','ADMIN'].includes(p.role),'FORBIDDEN','An operator must initiate advisory orchestration.',403);
  requireThat(this.settings.enabled,'ORCHESTRATION_DISABLED','Orchestration is disabled.',409);
  const snapshot=factsFromRequest(await this.service.get(p,requestId));
  return transaction(this.db,p.orgId,async tx=>{
   await requestRow(tx,p,requestId);
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${p.orgId}:${p.id}:orchestration:${key}`]);
   const inputHash=hash({requestId,retryOf:retryOf??null});
   const existing=(await tx.query('SELECT id,input_hash FROM orchestration_runs WHERE org_id=$1 AND created_by=$2 AND idempotency_key=$3',[p.orgId,p.id,key])).rows[0];
   if(existing){requireThat(existing.input_hash===inputHash,'IDEMPOTENCY_CONFLICT','Key belongs to another orchestration.',409);return {runId:existing.id};}
   if(retryOf) {
    const old=(await tx.query('SELECT * FROM orchestration_runs WHERE org_id=$1 AND id=$2',[p.orgId,retryOf])).rows[0];
    requireThat(old&&old.request_id===requestId&&['FAILED','TIMED_OUT'].includes(old.status),'INVALID_RECOVERY','Only a stopped run can be explicitly restarted.',409);
   }
   const id=randomUUID();
   await tx.query(`INSERT INTO orchestration_runs(id,org_id,request_id,created_by,idempotency_key,input_hash,snapshot,status,retry_of,created_credential_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,'RUNNING',$8,$9)`,[id,p.orgId,requestId,p.id,key,inputHash,snapshot,retryOf??null,p.credentialId]);
   for(let index=0;index<3;index++) {
    const stageId=randomUUID();
    await tx.query(`INSERT INTO orchestration_stages(id,org_id,run_id,ordinal,agent_id,agent_version,session_object,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'READY')`,[stageId,p.orgId,id,index+1,AGENT_IDS[index],this.settings.versions[index],`gate-orchestration:${id}:${stageId}`]);
   }
   return {runId:id};
  });
 }
 async get(p:Principal,id:string) {
  this.access(p);
  return transaction(this.db,p.orgId,async tx=>{
   const run=(await tx.query('SELECT * FROM orchestration_runs WHERE org_id=$1 AND id=$2',[p.orgId,id])).rows[0];
   requireThat(run,'NOT_FOUND','Orchestration not found.',404);await requestRow(tx,p,run.request_id);
   const stages=(await tx.query('SELECT * FROM orchestration_stages WHERE org_id=$1 AND run_id=$2 ORDER BY ordinal',[p.orgId,id])).rows;
   const events=(await tx.query(`SELECT e.* FROM orchestration_events e JOIN orchestration_stages s ON s.org_id=e.org_id AND s.id=e.stage_id
    WHERE e.org_id=$1 AND s.run_id=$2 ORDER BY e.received_at,e.event_hash LIMIT 100`,[p.orgId,id])).rows;
   return {run,stages,events,financialApproval:false};
  });
 }
 async recover(p:Principal,id:string,key:string) {
  const {run}=await this.get(p,id);
  return this.start(p,run.request_id,key,id);
 }
 private async findings(tx:Tx,run:any) {
  return (await tx.query("SELECT findings FROM orchestration_stages WHERE org_id=$1 AND run_id=$2 AND status='SUCCEEDED' ORDER BY ordinal",[run.org_id,run.id])).rows.map(s=>s.findings);
 }
 private async fail(tx:Tx,run:any,stage:any,code:string,timedOut=false,detail:unknown=null) {
  if(run.status!=='RUNNING'||terminal.has(stage.status))return;
  const findings=await this.findings(tx,run);
  await tx.query(`UPDATE orchestration_stages SET status=$3,error_code=$4,error_detail=$5,completed_at=now() WHERE org_id=$1 AND id=$2`,
   [run.org_id,stage.id,timedOut?'TIMED_OUT':'FAILED',code,detail===null?null:JSON.stringify(detail)]);
  await tx.query('UPDATE orchestration_runs SET status=$3,error_code=$4,escalation=$5,completed_at=now() WHERE org_id=$1 AND id=$2',
   [run.org_id,run.id,timedOut?'TIMED_OUT':'FAILED',code,escalationDraft(run.request_id,findings,code)]);
 }
 private async advance(tx:Tx,run:any,stage:any) {
  if(run.status!=='RUNNING'||terminal.has(stage.status)||!stage.dispatch_confirmed||!stage.tool_result||!stage.final_result)return;
  if(new Date(stage.expires_at).getTime()<=Date.now()){await this.fail(tx,run,stage,'DEVREV_TIMEOUT',true);return;}
  const current=(await tx.query('SELECT version FROM requests WHERE org_id=$1 AND id=$2 FOR SHARE',[run.org_id,run.request_id])).rows[0];
  if(current?.version!==run.snapshot.version){await this.fail(tx,run,stage,'STALE_REQUEST');return;}
  let assessment;
  try{assessment=validateFinal(stage.final_result,stage.ordinal,stage.tool_result.facts,stage.tool_result.traceId);}
  catch{await this.fail(tx,run,stage,'INVALID_AGENT_FINDINGS');return;}
  const findings={stage:stage.ordinal,agentId:stage.agent_id,agentVersion:stage.agent_version,sessionId:stage.session_id,
   traceId:stage.tool_result.traceId,backendFacts:stage.tool_result.facts,
   agentCommentary:{findingCode:assessment.findingCode,summary:assessment.summary,authority:'ADVISORY_ONLY'},financialApproval:false};
  await tx.query("UPDATE orchestration_stages SET status='SUCCEEDED',findings=$3,completed_at=now() WHERE org_id=$1 AND id=$2",[run.org_id,stage.id,findings]);
  if(stage.ordinal<3)await tx.query('UPDATE orchestration_runs SET current_stage=$3 WHERE org_id=$1 AND id=$2',[run.org_id,run.id,stage.ordinal+1]);
  else {
   const verified=await this.findings(tx,run),human=verified.some(f=>needsHuman(f.backendFacts));
   await tx.query('UPDATE orchestration_runs SET status=$3,escalation=$4,completed_at=now() WHERE org_id=$1 AND id=$2',
    [run.org_id,run.id,human?'HUMAN_REVIEW_REQUIRED':'COMPLETED',human?escalationDraft(run.request_id,verified):null]);
  }
 }
 async runOnce() {
  if(!this.settings.enabled)return false;
  const orgId=this.settings.gateOrgId;
  const claimed=await transaction(this.db,orgId,async tx=>{
   const run=(await tx.query(`SELECT r.* FROM orchestration_runs r JOIN orchestration_stages s ON s.org_id=r.org_id AND s.run_id=r.id AND s.ordinal=r.current_stage
    WHERE r.org_id=$1 AND r.status='RUNNING' AND (s.status='READY' OR (s.status IN ('SENDING','WAITING','DISPATCH_UNKNOWN') AND s.expires_at<=now()))
    ORDER BY r.created_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`,[orgId])).rows[0];
   if(!run)return null;
   const stage=(await tx.query('SELECT * FROM orchestration_stages WHERE org_id=$1 AND run_id=$2 AND ordinal=$3 FOR UPDATE',[orgId,run.id,run.current_stage])).rows[0];
   // A joined eligibility snapshot can predate another worker's claim. Recheck
   // the locked stage; an unexpired in-flight invocation is never a timeout.
   if(stage.status!=='READY'){
    if(['SENDING','WAITING','DISPATCH_UNKNOWN'].includes(stage.status)&&new Date(stage.expires_at).getTime()<=Date.now())
     await this.fail(tx,run,stage,'DEVREV_TIMEOUT',true);
    return null;
   }
   const request=(await tx.query('SELECT version FROM requests WHERE org_id=$1 AND id=$2',[orgId,run.request_id])).rows[0];
   const allowed=(await tx.query(`SELECT 1 FROM principals p JOIN principal_projects pp ON pp.org_id=p.org_id AND pp.principal_id=p.id
    JOIN requests r ON r.org_id=pp.org_id AND r.project_id=pp.project_id WHERE p.org_id=$1 AND p.id=$2 AND p.active
    AND p.role IN ('OPERATOR','ADMIN') AND r.id=$3
    AND 'request:read'=ANY(gate_credential_capabilities($4))`,[orgId,run.created_by,run.request_id,run.created_credential_id])).rowCount;
   if(!allowed||request?.version!==run.snapshot.version){await this.fail(tx,run,stage,allowed?'STALE_REQUEST':'INITIATOR_ACCESS_REVOKED');return null;}
   const message=stageMessage(run,stage,await this.findings(tx,run)),promptHash=hash(message);
   const metadata={phase:'gate-orchestration-2',orgId,requestId:run.request_id,runId:run.id,stageId:stage.id,ordinal:stage.ordinal,promptHash};
   const body=invocationPayload({agentId:stage.agent_id,versionId:stage.agent_version,sessionObject:stage.session_object,metadata,message,webhookId:this.settings.webhookId});
   await tx.query(`UPDATE orchestration_stages SET status='SENDING',prompt=$3,prompt_hash=$4,started_at=now(),expires_at=now()+($5*interval '1 second')
    WHERE org_id=$1 AND id=$2`,[orgId,stage.id,body,promptHash,this.settings.timeoutSeconds]);
   return {run,stage,body};
  });
  if(!claimed)return false;
  try{await this.connectionReady(claimed.stage);}
  catch(error){
   await transaction(this.db,orgId,async tx=>{
    const run=(await tx.query('SELECT * FROM orchestration_runs WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,claimed.run.id])).rows[0];
    const stage=(await tx.query('SELECT * FROM orchestration_stages WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,claimed.stage.id])).rows[0];
    await this.fail(tx,run,stage,(error as any).code??'DEVREV_CONNECTION_UNAVAILABLE');
   });return true;
  }
  let response:Awaited<ReturnType<typeof dispatchAsync>>;
  try{response=await dispatchAsync(claimed.body,this.settings.apiToken,this.transport);}
  catch{
   await transaction(this.db,orgId,async tx=>{
    await tx.query('SELECT id FROM orchestration_runs WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,claimed.run.id]);
    await tx.query("UPDATE orchestration_stages SET status='DISPATCH_UNKNOWN',error_code='DEVREV_DISPATCH_UNKNOWN' WHERE org_id=$1 AND id=$2 AND status='SENDING'",[orgId,claimed.stage.id]);
   });return true;
  }
  await transaction(this.db,orgId,async tx=>{
   const run=(await tx.query('SELECT * FROM orchestration_runs WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,claimed.run.id])).rows[0];
   const stage=(await tx.query('SELECT * FROM orchestration_stages WHERE org_id=$1 AND id=$2 FOR UPDATE',[orgId,claimed.stage.id])).rows[0];
   if(run.status!=='RUNNING'||terminal.has(stage.status))return;
   await tx.query('UPDATE orchestration_stages SET http_status=$3 WHERE org_id=$1 AND id=$2',[orgId,stage.id,response.httpStatus]);
   if(!response.accepted){await this.fail(tx,run,stage,'DEVREV_API_REJECTED',false,{httpStatus:response.httpStatus,...response.apiError});return;}
   const validSession=typeof response.sessionId==='string'&&/^don:core:dvrv-us-1:devo\/17WZM4zcjj:ai_agent_session\/[^:]+$/.test(response.sessionId);
   if(!validSession||(stage.session_id&&stage.session_id!==response.sessionId)){await this.fail(tx,run,stage,'DEVREV_SESSION_MISMATCH');return;}
   await tx.query("UPDATE orchestration_stages SET status='WAITING',dispatch_confirmed=true,http_status=$3,session_id=$4 WHERE org_id=$1 AND id=$2",[orgId,stage.id,response.httpStatus,response.sessionId]);
   await this.advance(tx,run,{...stage,status:'WAITING',dispatch_confirmed:true,session_id:response.sessionId});
  });return true;
 }
 /** Called only behind authenticated webhook boundary. All evidence is sanitized before storage. */
 async receive(raw:unknown) {
  const event=eventSchema.parse(agentEvent(raw)),m=event.client_metadata;
  requireThat(m.orgId===this.settings.gateOrgId,'INVALID_ORCHESTRATION_EVENT','Organization mismatch.',409);
  return transaction(this.db,m.orgId,async tx=>{
   const run=(await tx.query('SELECT * FROM orchestration_runs WHERE org_id=$1 AND id=$2 FOR UPDATE',[m.orgId,m.runId])).rows[0];
   const stage=(await tx.query('SELECT * FROM orchestration_stages WHERE org_id=$1 AND id=$2 AND run_id=$3 FOR UPDATE',[m.orgId,m.stageId,m.runId])).rows[0];
   requireThat(run&&stage&&run.request_id===m.requestId&&stage.ordinal===m.ordinal&&stage.agent_id===event.agent
    &&stage.session_object===event.session_object&&stage.prompt_hash===m.promptHash
    &&(!stage.session_id||stage.session_id===event.session),'INVALID_ORCHESTRATION_EVENT','Stage/session binding mismatch.',409);
   requireThat(stage.status!=='READY','INVALID_ORCHESTRATION_EVENT','Stage has not been dispatched.',409);
   const tool=event.progress?.skill_executed??event.progress?.skill_triggered;
   const proof=event.progress?.progress_state==='skill_executed'&&canonicalTool(tool?.skill_name)==='gategetrequest'
    ?gateEnvelopes((tool as any)?.output,m.requestId):[];
   let toolResult:any=null,proofError:string|undefined;
   if(proof.length) {
    try {
     const envelope=proof[0],facts=factsFromRequest(envelope.data);
     requireThat(envelope.access_mode==='orchestration_read_only','UNSAFE_MCP_CONNECTION','Read-only MCP transport is required.',409);
     requireThat(hash(facts)===hash(run.snapshot),'STALE_REQUEST','Request changed since orchestration start.',409);
     toolResult={facts,traceId:z.string().uuid().parse(envelope.trace_id),serverVersion:envelope.server_version};
    }catch(error){proofError=(error as any).code??'INVALID_GATE_RESULT';}
   }
   const ignored=run.status!=='RUNNING'||terminal.has(stage.status);
   const recorded={authenticated:true,agentId:event.agent,sessionId:event.session,type:event.agent_response,
    progressState:event.progress?.progress_state,toolName:tool?.skill_name,
    requestArgument:typeof (tool as any)?.args?.request_id==='string'?scrub((tool as any).args.request_id).slice(0,40):null,toolResult,
    message:event.agent_response==='message'?scrub(event.message??''):null,
    error:event.agent_response==='error'?scrub(event.error?.error??'DEVREV_AGENT_ERROR'):proofError??null};
   const inserted=await tx.query('INSERT INTO orchestration_events(org_id,stage_id,event_hash,event,ignored) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [m.orgId,stage.id,hash(event),recorded,ignored]);
   if(!inserted.rowCount||ignored)return {processed:false};
   if(new Date(stage.expires_at).getTime()<=Date.now()){await this.fail(tx,run,stage,'DEVREV_TIMEOUT',true);return {processed:true};}
   if(event.agent_response==='error'){await this.fail(tx,run,stage,'DEVREV_AGENT_ERROR',false,recorded.error);return {processed:true};}
   if(tool&&canonicalTool(tool.skill_name)!=='gategetrequest'){await this.fail(tx,run,stage,'UNEXPECTED_AGENT_TOOL');return {processed:true};}
   if(event.progress?.progress_state==='skill_triggered'&&((tool as any)?.args?.request_id!==run.request_id||
     ![undefined,false].includes((tool as any)?.args?.validate_decision))){await this.fail(tx,run,stage,'UNEXPECTED_TOOL_INPUT');return {processed:true};}
   if(proofError){await this.fail(tx,run,stage,proofError);return {processed:true};}
   if(event.progress?.progress_state==='skill_executed'&&!toolResult){await this.fail(tx,run,stage,'MCP_EXECUTION_NOT_CONFIRMED');return {processed:true};}
   if(event.agent_response==='message'&&stage.final_result&&stage.final_result!==scrub(event.message??'')) {
    await this.fail(tx,run,stage,'CONFLICTING_FINAL_RESPONSE');return {processed:true};
   }
   if(toolResult&&stage.tool_result&&hash(toolResult)!==hash(stage.tool_result)) {
    await this.fail(tx,run,stage,'CONFLICTING_TOOL_RESULT');return {processed:true};
   }
   const finalResult=event.agent_response==='message'?scrub(event.message??''):stage.final_result;
   await tx.query('UPDATE orchestration_stages SET session_id=$3,tool_result=$4,final_result=$5 WHERE org_id=$1 AND id=$2',
    [m.orgId,stage.id,event.session,toolResult??stage.tool_result,finalResult]);
   await this.advance(tx,run,{...stage,session_id:event.session,tool_result:toolResult??stage.tool_result,final_result:finalResult});
   return {processed:true};
  });
 }
}

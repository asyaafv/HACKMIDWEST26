/** Real isolated PostgreSQL; mocked DevRev transport is never presented as live agent proof. */
import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool,transaction } from '../src/db.js';
import { migrate,inspectMigrations } from '../scripts/migrate.js';
import { seedControls } from '../scripts/seed.js';
import { GateService } from '../src/service.js';
import { OrchestrationCoordinator } from '../src/orchestration.js';
import { AGENT_IDS,DEVREV_ORG,factsFromRequest,expectedFinding,type OrchestrationSettings } from '../src/orchestration-contracts.js';
import { createApp } from '../src/app.js';
import { evaluate } from '../src/policy.js';
import type { Principal } from '../src/contracts.js';
import { configuration } from '../src/config.js';
const requestId='9de772b5-4c6f-41b1-9510-46eb74ac28b9';
const port=57000+process.pid%1000;
const pg=new EmbeddedPostgres({databaseDir:`work/orchestration-test-${randomUUID()}`,user:'orchestration_test',password:'isolated_test_only',
 port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let admin:Pool,db:Pool,service:GateService,settings:OrchestrationSettings,p:Principal,token:string;
let calls:any[]=[],failTransport=false,releaseResponse:(()=>void)|undefined;
const transport:typeof fetch=async(url,init)=>{
 if(String(url).endsWith('dev-users.self'))return new Response(JSON.stringify({dev_user:{id:`don:identity:dvrv-us-1:devo/${DEVREV_ORG}:devu/4`}}));
 if(String(url).endsWith('webhooks.get'))return new Response(JSON.stringify({webhook:{id:settings.webhookId,status:'active',url:'https://example.test/v1/integrations/devrev/orchestration/webhook'}}));
 if(String(url).endsWith('ai-agents.get')) {
  const id=JSON.parse(String(init?.body)).id,index=AGENT_IDS.indexOf(id);
  return new Response(JSON.stringify({agent:{id,default_version_id:{id:settings.versions[index]},skills:[{name:'GateGetRequest'}]}}));
 }
 const body=JSON.parse(String(init?.body));calls.push(body);
 if(failTransport)throw new Error('secret-network-diagnostics');
 if(releaseResponse)await new Promise<void>(resolve=>{releaseResponse=resolve;});
 return new Response(JSON.stringify({session:{id:`don:core:dvrv-us-1:devo/${DEVREV_ORG}:ai_agent_session/${body.client_metadata.stageId}`}}));
};
const coordinator=()=>new OrchestrationCoordinator(db,service,settings,transport);
beforeAll(async()=>{
 await pg.initialise();await pg.start();await pg.createDatabase('orchestration_tests');
 const connectionString=`postgresql://orchestration_test:isolated_test_only@127.0.0.1:${port}/orchestration_tests`;
 admin=new Pool({connectionString});
 expect((await inspectMigrations(admin)).pending).toContain('090_devrev_orchestration.sql');
 expect((await admin.query("SELECT to_regclass('public.gate_migrations') AS ledger")).rows[0].ledger).toBeNull();
 await migrate(admin);expect(await inspectMigrations(admin)).toMatchObject({pending:[],changed:[]});
 const controls=await seedControls(admin);
 token=controls.identities.OPERATOR!.token;
 const credential=(await admin.query('SELECT id FROM credentials WHERE principal_id=$1',[controls.identities.OPERATOR!.id])).rows[0].id;
 p={id:controls.identities.OPERATOR!.id,orgId:controls.orgId,credentialId:credential,role:'OPERATOR',approvalLimitMinor:'0',capabilities:['request:read']};
 const proposal={agentId:controls.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'100001',currency:'USD' as const,
  category:'diagnostics' as const,purpose:'Read-only orchestration fixture',source:{domain:'pm' as const,sourceId:'GATE-ISSUE-404'}};
 const decision=evaluate({proposal,agentActive:true,agentCapMinor:'500000',merchantStatus:'ALLOWED',budgetAvailableMinor:'2500000',dailyUsedMinor:'0',dailyCount:0,evidenceComplete:false,contradictoryEvidence:true});
 await admin.query(`INSERT INTO requests(id,org_id,created_by,credential_id,agent_id,project_id,merchant_id,amount_minor,proposal,evidence,decision,status)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'AWAITING_EVIDENCE')`,[requestId,p.orgId,p.id,credential,controls.agentId,controls.projectId,controls.merchantId,'100001',proposal,
  {complete:false,items:[],links:[],missing:['GATE-ISSUE-404'],bundleHash:'fixture-only'},decision]);
 db=new Pool({connectionString,options:'-c role=gate_runtime'});service=new GateService(db);
 settings={enabled:true,apiToken:'fixture-only-token',gateOrgId:p.orgId,webhookId:`don:integration:dvrv-us-1:devo/${DEVREV_ORG}:webhook/fixture`,
  webhookSecret:'fixture-only-secret-'.repeat(3),versions:AGENT_IDS.map((id,index)=>`${id}:ai_agent_version/${[4,7,8][index]}.1`) as [string,string,string],timeoutSeconds:300};
});
beforeEach(async()=>{
 calls=[];failTransport=false;releaseResponse=undefined;
 await admin.query("UPDATE orchestration_runs SET status='FAILED' WHERE status='RUNNING'");
 await admin.query('UPDATE requests SET version=1 WHERE id=$1',[requestId]);
});
afterAll(async()=>{await db?.end();await admin?.end();await pg.stop();});
async function start(){return (await coordinator().start(p,requestId,randomUUID())).runId;}
async function details(id:string){return coordinator().get(p,id);}
function event(stage:any,type:'message'|'progress'|'error',output?:unknown) {
 return {type:'ai_agent_response',ai_agent_response:{agent:stage.agent_id,session_object:stage.session_object,
  session:`don:core:dvrv-us-1:devo/${DEVREV_ORG}:ai_agent_session/${stage.id}`,client_metadata:stage.prompt.client_metadata,agent_response:type,
  ...(type==='progress'?{progress:{progress_state:'skill_executed',skill_executed:{skill_name:'custom__gate-mcp_GateGetRequest',output}}}:{}),
  ...(type==='message'?{message:output as string}:{}),...(type==='error'?{error:{error:'fixture-only agent error'}}:{})}};
}
async function proof() {
 return {mode:'sandbox',provider:'simulator',access_mode:'orchestration_read_only',trace_id:randomUUID(),server_version:'0.4.1',data:await service.get(p,requestId)};
}
function final(stage:any,gate:any) {
 const facts=factsFromRequest(gate.data);
 return JSON.stringify({requestId,stage:stage.ordinal,traceId:gate.trace_id,requestVersion:1,policyVerdict:facts.policyVerdict,riskScore:facts.riskScore,
  findingCode:expectedFinding(stage.ordinal,facts),summary:`Fixture advisory analysis for specialized stage ${stage.ordinal}`,financialApproval:false});
}
async function complete(id:string,ordinal:number,reverse=false) {
 const stage=(await details(id)).stages[ordinal-1],gate=await proof();
 const tool=event(stage,'progress',{content:[{type:'text',text:JSON.stringify(gate)}]}),message=event(stage,'message',final(stage,gate));
 for(const payload of reverse?[message,tool]:[tool,message])await coordinator().receive(payload);
 return {stage,gate,tool,message};
}
async function financialState() {
 const tables=['requests','payments','authorizations','approvals','budgets','budget_entries','request_revisions','audit_events'];
 const result:Record<string,unknown>={};
 for(const name of tables)result[name]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${name} t ORDER BY to_jsonb(t)::text`)).rows;
 return result;
}
it('durably invokes three actual agent IDs in order, pins versions, passes verified findings and prepares escalation without financial writes',async()=>{
 const before=await financialState(),id=await start();
 for(let ordinal=1;ordinal<=3;ordinal++) {
  // A fresh coordinator per tick simulates process restart.
  await coordinator().runOnce();expect(calls).toHaveLength(ordinal);
  expect(calls[ordinal-1]).toMatchObject({agent:AGENT_IDS[ordinal-1],agent_version:settings.versions[ordinal-1],target:'webhook_target'});
  expect(calls[ordinal-1].event.input_message.message).toContain('Independently call custom__gate-mcp_GateGetRequest');
  if(ordinal>1)expect(calls[ordinal-1].event.input_message.message).toContain('agentCommentary');
  await complete(id,ordinal,ordinal===2);
 }
 const result=await details(id);
 expect(result.run.status).toBe('HUMAN_REVIEW_REQUIRED');expect(result.run.escalation).toMatchObject({financialApproval:false,paymentExecution:false,status:'PREPARED'});
 expect(result.stages.every(s=>s.status==='SUCCEEDED'&&s.findings.traceId&&s.session_id)).toBe(true);
 expect(result.events).toHaveLength(6);expect(await financialState()).toEqual(before);
});
it('serializes concurrent idempotent starts and workers; authenticated callback replay never advances twice',async()=>{
 const key=randomUUID(),starts=await Promise.all([coordinator().start(p,requestId,key),coordinator().start(p,requestId,key)]);
 expect(starts[0]).toEqual(starts[1]);const id=starts[0]!.runId;
 await Promise.all(Array.from({length:20},()=>coordinator().runOnce()));expect(calls).toHaveLength(1);
 const {tool,message}=await complete(id,1);
 expect(await coordinator().receive(tool)).toEqual({processed:false});expect(await coordinator().receive(message)).toEqual({processed:false});
 const result=await details(id);expect(result.run.error_code).toBeNull();
 expect(result.run.current_stage).toBe(2);expect(result.events).toHaveLength(2);
 await expect(coordinator().start(p,randomUUID(),key)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('requires actual tool output; final prose cannot advance, wrong agent/session/run bindings and stale facts fail closed',async()=>{
 const id=await start();await coordinator().runOnce();const stage=(await details(id)).stages[0],gate=await proof();
 await coordinator().receive(event(stage,'message',final(stage,gate)));
 expect((await details(id)).run.current_stage).toBe(1);
 const wrong=event(stage,'progress',gate);wrong.ai_agent_response.agent=AGENT_IDS[1]!;
 await expect(coordinator().receive(wrong)).rejects.toMatchObject({code:'INVALID_ORCHESTRATION_EVENT'});
 const stale={...gate,data:{...gate.data,version:2}};
 await coordinator().receive(event(stage,'progress',stale));expect((await details(id)).run.error_code).toBe('STALE_REQUEST');
});
it('rejects unrestricted MCP proof, tool failures, mutation attempts and invented final findings',async()=>{
 for(const kind of ['unrestricted','tool-error','write-tool','invented']) {
  const id=await start();await coordinator().runOnce();const stage=(await details(id)).stages[0],gate=await proof();
  if(kind==='unrestricted')delete (gate as any).access_mode;
  const payload=event(stage,'progress',kind==='tool-error'?{isError:true,...gate}:gate);
  if(kind==='write-tool')payload.ai_agent_response.progress!.skill_executed.skill_name='custom__gate-mcp_GateRequestSpend';
  await coordinator().receive(payload);
  if(kind==='invented')await coordinator().receive(event(stage,'message',final(stage,{...gate,data:{...gate.data,decision:{...gate.data.decision,riskScore:0}}})));
  expect((await details(id)).run.status).toBe('FAILED');
 }
});
it('persists ambiguous dispatch, never automatically retries it, expires to human review, and fences late callbacks during explicit recovery',async()=>{
 const id=await start();failTransport=true;await coordinator().runOnce();
 expect((await details(id)).stages[0].status).toBe('DISPATCH_UNKNOWN');
 await coordinator().runOnce();expect(calls).toHaveLength(1);
 const old=(await details(id)).stages[0];await admin.query("UPDATE orchestration_stages SET expires_at=now()-interval '1 second' WHERE id=$1",[old.id]);
 await coordinator().runOnce();expect((await details(id)).run.status).toBe('TIMED_OUT');
 expect(await coordinator().receive(event(old,'progress',await proof()))).toEqual({processed:false});
 const recovery=await coordinator().recover(p,id,randomUUID());expect(recovery.runId).not.toBe(id);
 expect((await details(recovery.runId)).run.retry_of).toBe(id);
});
it('accepts callbacks racing the API response, but advances only after the response session is confirmed',async()=>{
 const id=await start();releaseResponse=()=>{};const dispatch=coordinator().runOnce();
 for(let i=0;i<100&&!calls.length;i++)await new Promise(r=>setTimeout(r,5));
 await complete(id,1);expect((await details(id)).run.current_stage).toBe(1);
 releaseResponse!();await dispatch;expect((await details(id)).run.current_stage).toBe(2);
});
it('does not advance when an API confirmation arrives after the persisted deadline',async()=>{
 const id=await start();releaseResponse=()=>{};const dispatch=coordinator().runOnce();
 for(let i=0;i<100&&!calls.length;i++)await new Promise(r=>setTimeout(r,5));
 await complete(id,1);const stage=(await details(id)).stages[0];
 await admin.query("UPDATE orchestration_stages SET expires_at=now()-interval '1 second' WHERE id=$1",[stage.id]);
 releaseResponse!();await dispatch;
 expect((await details(id)).run.status).toBe('TIMED_OUT');expect((await details(id)).run.current_stage).toBe(1);
});
it('enforces tenant/project access, denies agent/finance starts and authenticates callback verification through REST',async()=>{
 await expect(coordinator().start({...p,orgId:randomUUID()},requestId,randomUUID())).rejects.toMatchObject({code:'NOT_FOUND'});
 for(const role of ['AGENT','FINANCE'] as const)await expect(coordinator().start({...p,role},requestId,randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});
 await transaction(db,randomUUID(),async tx=>expect((await tx.query('SELECT * FROM orchestration_runs')).rows).toHaveLength(0));
 const app=createApp(db,{orchestration:settings});
 try {
  expect((await app.inject({method:'POST',url:'/v1/integrations/devrev/orchestration/webhook',payload:{type:'verify',verify:{challenge:'fixture'}}})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/v1/integrations/devrev/orchestration/webhook',headers:{'x-api-key':settings.webhookSecret},payload:{type:'verify',verify:{challenge:'fixture'}}})).json()).toEqual({challenge:'fixture'});
  expect((await app.inject({method:'POST',url:'/v1/orchestrations',headers:{authorization:`Bearer ${token}`,'idempotency-key':randomUUID()},payload:{requestId}})).statusCode).toBe(202);
 }finally{await app.close();}
});
it('exposes only GateGetRequest on the orchestration MCP endpoint and preserves the original tool catalog',async()=>{
 const before=await financialState(),app=createApp(db);
 const headers={host:'localhost:8000',authorization:`Bearer ${token}`,accept:'application/json, text/event-stream'};
 const call=async(url:string,method:string,params:any)=>{
  const response=await app.inject({method:'POST',url,headers,payload:{jsonrpc:'2.0',id:1,method,params}});expect(response.statusCode).toBe(200);return response.json().result;
 };
 try {
  const tools=await call('/mcp/orchestration','tools/list',{});expect(tools.tools.map((t:any)=>t.name)).toEqual(['gate_get_request']);
  expect((await call('/mcp','tools/list',{})).tools.some((t:any)=>t.name==='gate_request_spend')).toBe(true);
  const read=await call('/mcp/orchestration','tools/call',{name:'gate_get_request',arguments:{request_id:requestId}});
  expect(read.structuredContent).toMatchObject({access_mode:'orchestration_read_only',data:{id:requestId,policyVerdict:'REVIEW'}});
  const response=await app.inject({method:'POST',url:'/mcp/orchestration',headers,payload:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'gate_request_spend',arguments:{}}}});
  expect(response.json().result?.isError??!!response.json().error).toBe(true);expect(await financialState()).toEqual(before);
 }finally{await app.close();}
});
it('requires three correctly associated version pins before enabling orchestration',()=>{
 expect(()=>configuration({DATABASE_URL:'postgresql://fixture/fixture',DEVREV_ORCHESTRATION_ENABLED:'true'})).toThrow();
 expect(configuration({DATABASE_URL:'postgresql://fixture/fixture'}).DEVREV_ORCHESTRATION_ENABLED).toBe(false);
});
it('serves scoped UI run discovery, authenticated readiness and read-only request validation without exposing secrets',async()=>{
 const id=await start(),app=createApp(db,{orchestration:settings});
 try{
  expect((await app.inject({method:'GET',url:'/v1/orchestrations/status'})).statusCode).toBe(401);
  const headers={authorization:`Bearer ${token}`};
  const status=await app.inject({method:'GET',url:'/v1/orchestrations/status',headers});
  expect(status.json().data).toEqual({ready:true,blockers:[],financialApproval:false});
  expect(status.headers['cache-control']).toBe('private, no-store');expect(status.body).not.toContain(settings.apiToken);
  const list=await app.inject({method:'GET',url:`/v1/requests/${requestId}/orchestrations`,headers});
  expect(list.json().data.items[0].id).toBe(id);
  expect((await app.inject({method:'GET',url:`/v1/requests/${randomUUID()}/orchestrations`,headers})).statusCode).toBe(404);
  expect((await app.inject({method:'GET',url:`/v1/requests/${requestId}/validation`,headers})).statusCode).toBe(200);
  expect((await app.inject({method:'GET',url:`/v1/requests/${requestId}/history`,headers})).statusCode).toBe(200);
 }finally{await app.close();}
 const disabled=new OrchestrationCoordinator(db,service,{...settings,enabled:false,webhookSecret:'',versions:['','','']});
 expect((await disabled.availability(p)).blockers).toEqual(['ORCHESTRATION_DISABLED','DEDICATED_WEBHOOK_NOT_CONFIGURED','READ_ONLY_VERSIONS_NOT_CONFIGURED']);
});
it('persists HTTP rejection and session mismatch without dispatching a following stage',async()=>{
 for(const kind of ['rejected','wrong-session']) {
  const adapter:typeof fetch=async(url,init)=>String(url).endsWith('execute-async')?
   new Response(JSON.stringify(kind==='rejected'?{type:'forbidden',message:'fixture denied'}:{session:{id:'don:core:dvrv-us-1:devo/other:ai_agent_session/1'}}),{status:kind==='rejected'?403:200}):transport(url,init);
  const c=new OrchestrationCoordinator(db,service,settings,adapter),id=(await c.start(p,requestId,randomUUID())).runId;
  await c.runOnce();const result=await c.get(p,id);
  expect(result.run.status).toBe('FAILED');expect(result.run.current_stage).toBe(1);
  expect(result.stages[0].error_code).toBe(kind==='rejected'?'DEVREV_API_REJECTED':'DEVREV_SESSION_MISMATCH');
  expect(result.stages[0].http_status).toBe(kind==='rejected'?403:200);
  expect(await c.runOnce()).toBe(false);
 }
});
it('rejects wrong-org tokens and the production trust webhook before executing an agent',async()=>{
 for(const kind of ['wrong-org','trust-webhook']) {
  const adapter:typeof fetch=async(url,init)=>{
   if(kind==='wrong-org'&&String(url).endsWith('dev-users.self'))return new Response(JSON.stringify({dev_user:{id:'don:identity:dvrv-us-1:devo/old:devu/1'}}));
   if(kind==='trust-webhook'&&String(url).endsWith('webhooks.get'))return new Response(JSON.stringify({webhook:{id:settings.webhookId,status:'active',url:'https://example.test/v1/integrations/devrev/trust/webhook'}}));
   return transport(url,init);
  };
  const c=new OrchestrationCoordinator(db,service,settings,adapter),id=(await c.start(p,requestId,randomUUID())).runId;
  await c.runOnce();expect((await c.get(p,id)).run.error_code).toBe(kind==='wrong-org'?'DEVREV_WRONG_ORG':'DEVREV_WEBHOOK_NOT_READY');
  expect(calls).toHaveLength(0);
 }
});
it('checks revoked initiating credentials and request revisions before dispatch and after tool execution',async()=>{
 const revoked=await start();await admin.query('UPDATE credentials SET revoked_at=now() WHERE id=$1',[p.credentialId]);
 try{await coordinator().runOnce();expect((await details(revoked)).run.error_code).toBe('INITIATOR_ACCESS_REVOKED');expect(calls).toHaveLength(0);}
 finally{await admin.query('UPDATE credentials SET revoked_at=NULL WHERE id=$1',[p.credentialId]);}
 const stale=await start();await coordinator().runOnce();const stage=(await details(stale)).stages[0],gate=await proof();
 await coordinator().receive(event(stage,'progress',gate));await admin.query('UPDATE requests SET version=2 WHERE id=$1',[requestId]);
 await coordinator().receive(event(stage,'message',final(stage,gate)));expect((await details(stale)).run.error_code).toBe('STALE_REQUEST');
});
it('rejects broader published skills or a changed default version before invoking DevRev',async()=>{
 for(const kind of ['write-skill','republished']) {
  const adapter:typeof fetch=async(url,init)=>{
   if(String(url).endsWith('ai-agents.get'))return new Response(JSON.stringify({agent:{id:AGENT_IDS[0],
    default_version_id:{id:kind==='republished'?`${AGENT_IDS[0]}:ai_agent_version/4.2`:settings.versions[0]},
    skills:kind==='write-skill'?[{name:'GateGetRequest'},{name:'GateRequestSpend'}]:[{name:'GateGetRequest'}]}}));
   return transport(url,init);
  };
  const c=new OrchestrationCoordinator(db,service,settings,adapter),id=(await c.start(p,requestId,randomUUID())).runId;
  await c.runOnce();expect((await c.get(p,id)).run.error_code).toBe('SAFE_AGENT_VERSION_REQUIRED');expect(calls).toHaveLength(0);
 }
});
it('rejects cross-run metadata and callback sessions, and requires explicit stopped-run recovery',async()=>{
 const id=await start();await coordinator().runOnce();const stage=(await details(id)).stages[0],gate=await proof();
 for(const kind of ['session','run','org','hash']) {
  const payload=event(stage,'progress',gate);
  // Clone metadata so a deliberately malformed event cannot mutate the fixture.
  payload.ai_agent_response.client_metadata={...payload.ai_agent_response.client_metadata};
  if(kind==='session')payload.ai_agent_response.session+='-other';
  if(kind==='run')payload.ai_agent_response.client_metadata.runId=randomUUID();
  if(kind==='org')payload.ai_agent_response.client_metadata.orgId=randomUUID();
  if(kind==='hash')payload.ai_agent_response.client_metadata.promptHash='0'.repeat(64);
  await expect(coordinator().receive(payload)).rejects.toMatchObject({code:'INVALID_ORCHESTRATION_EVENT'});
 }
 await expect(coordinator().recover(p,id,randomUUID())).rejects.toMatchObject({code:'INVALID_RECOVERY'});
 await coordinator().receive(event(stage,'error'));const key=randomUUID();
 const recovered=await coordinator().recover(p,id,key);expect(await coordinator().recover(p,id,key)).toEqual(recovered);
});
it('completes a low-risk advisory run without consent, authorization, budget reservation or payment',async()=>{
 const original=(await admin.query('SELECT decision,evidence FROM requests WHERE id=$1',[requestId])).rows[0];
 const decision={...original.decision,verdict:'APPROVE',riskScore:0,requiresHumanConsent:false,reviewRequirements:[],
  riskAssessment:{...original.decision.riskAssessment,score:0,reviewThreshold:40}};
 await admin.query('UPDATE requests SET decision=$2,evidence=$3 WHERE id=$1',[requestId,decision,{...original.evidence,complete:true}]);
 try {
  const before=await financialState(),id=await start();
  for(let ordinal=1;ordinal<=3;ordinal++){await coordinator().runOnce();await complete(id,ordinal);}
  expect((await details(id)).run.status).toBe('COMPLETED');expect((await details(id)).run.escalation).toBeNull();
  expect(await financialState()).toEqual(before);
 }finally{await admin.query('UPDATE requests SET decision=$2,evidence=$3 WHERE id=$1',[requestId,original.decision,original.evidence]);}
});

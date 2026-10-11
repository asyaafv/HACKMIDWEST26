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
import { applyAgentReview } from '../src/agent-review.js';
import { ORCHESTRATION_READ_ONLY_TOOLS } from '../src/capabilities.js';
const requestId='9de772b5-4c6f-41b1-9510-46eb74ac28b9';
const port=57000+process.pid%1000;
const pg=new EmbeddedPostgres({databaseDir:`work/orchestration-test-${randomUUID()}`,user:'orchestration_test',password:'isolated_test_only',
 port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let admin:Pool,db:Pool,service:GateService,settings:OrchestrationSettings,p:Principal,demoP:Principal,token:string,initialDecision:any;
let calls:any[]=[],failTransport=false,releaseResponse:(()=>void)|undefined;
const transport:typeof fetch=async(url,init)=>{
 if(String(url).endsWith('dev-users.self'))return new Response(JSON.stringify({dev_user:{id:`don:identity:dvrv-us-1:devo/${DEVREV_ORG}:devu/4`}}));
 if(String(url).endsWith('webhooks.get'))return new Response(JSON.stringify({webhook:{id:settings.webhookId,status:'active',url:'https://example.test/v1/integrations/devrev/orchestration/webhook'}}));
 if(String(url).endsWith('ai-agents.get')) {
  const id=JSON.parse(String(init?.body)).id,index=AGENT_IDS.indexOf(id);
  return new Response(JSON.stringify({agent:{id,default_version_id:{id:settings.versions[index]},skills:ORCHESTRATION_READ_ONLY_TOOLS.map(tool=>({name:tool.agent}))}}));
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
 demoP={id:controls.identities.FINANCE!.id,orgId:controls.orgId,credentialId:'',role:'FINANCE',approvalLimitMinor:'500000',capabilities:['request:read','catalog:read','context:read','finance:consent']};
 const proposal={agentId:controls.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'100001',currency:'USD' as const,
  category:'diagnostics' as const,purpose:'Read-only orchestration fixture',source:{domain:'pm' as const,sourceId:'GATE-ISSUE-404'}};
 const decision=evaluate({proposal,agentActive:true,agentCapMinor:'500000',merchantStatus:'ALLOWED',budgetAvailableMinor:'2500000',dailyUsedMinor:'0',dailyCount:0,evidenceComplete:false,contradictoryEvidence:true});initialDecision=decision;
 await admin.query(`INSERT INTO requests(id,org_id,created_by,credential_id,agent_id,project_id,merchant_id,amount_minor,proposal,evidence,decision,status)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'AWAITING_EVIDENCE')`,[requestId,p.orgId,p.id,credential,controls.agentId,controls.projectId,controls.merchantId,'100001',proposal,
  {complete:false,items:[],links:[],missing:['GATE-ISSUE-404'],bundleHash:'fixture-only'},decision]);
 db=new Pool({connectionString,options:'-c role=gate_runtime'});service=new GateService(db);
 settings={enabled:true,apiToken:'fixture-only-token',gateOrgId:p.orgId,webhookId:`don:integration:dvrv-us-1:devo/${DEVREV_ORG}:webhook/fixture`,
  webhookSecret:'fixture-only-secret-'.repeat(3),versions:AGENT_IDS.map((id,index)=>`${id}:ai_agent_version/${[4,7,8][index]}.1`) as [string,string,string],timeoutSeconds:300,
  demoReviewEnabled:false,demoPrincipalId:demoP.id};
});
beforeEach(async()=>{
 calls=[];failTransport=false;releaseResponse=undefined;
 await admin.query("UPDATE orchestration_runs SET status='FAILED' WHERE status='RUNNING'");
 await admin.query('DELETE FROM request_revisions WHERE request_id=$1',[requestId]);
 await admin.query('UPDATE requests SET version=1,status=$2,decision=$3 WHERE id=$1',[requestId,'AWAITING_EVIDENCE',initialDecision]);
});
afterAll(async()=>{await db?.end();await admin?.end();await pg.stop();});
async function start(){return (await coordinator().start(p,requestId,randomUUID())).runId;}
async function details(id:string){return coordinator().get(p,id);}
function event(stage:any,type:'message'|'progress'|'error',output?:unknown,skillName='custom__gate-mcp_GateGetRequest') {
 return {type:'ai_agent_response',ai_agent_response:{agent:stage.agent_id,session_object:stage.session_object,
  session:`don:core:dvrv-us-1:devo/${DEVREV_ORG}:ai_agent_session/${stage.id}`,client_metadata:stage.prompt.client_metadata,agent_response:type,
  ...(type==='progress'?{progress:{progress_state:'skill_executed',skill_executed:{skill_name:skillName,output}}}:{}),
  ...(type==='message'?{message:output as string}:{}),...(type==='error'?{error:{error:'fixture-only agent error'}}:{})}};
}
async function proof() {
 return {mode:'sandbox',provider:'simulator',access_mode:'orchestration_read_only',trace_id:randomUUID(),server_version:'0.4.1',data:await service.get(p,requestId)};
}
function final(stage:any,gate:any) {
 const facts=factsFromRequest(gate.data);
 return JSON.stringify({requestId,stage:stage.ordinal,traceId:gate.trace_id,requestVersion:facts.version,policyVerdict:facts.policyVerdict,riskScore:facts.riskScore,
  findingCode:expectedFinding(stage.ordinal,facts),summary:`Fixture advisory analysis for specialized stage ${stage.ordinal}`,riskSignals:[],financialApproval:false});
}
async function complete(id:string,ordinal:number,reverse=false,riskSignals:any[]=[],receiver=coordinator()) {
 const stage=(await details(id)).stages[ordinal-1],gate=await proof();
 const tool=event(stage,'progress',{content:[{type:'text',text:JSON.stringify(gate)}]}),message=event(stage,'message',final(stage,gate).replace('"riskSignals":[]',`"riskSignals":${JSON.stringify(riskSignals)}`));
 for(const payload of reverse?[message,tool]:[tool,message])await receiver.receive(payload);
 return {stage,gate,tool,message};
}
async function financialState() {
 const tables=['payments','authorizations','approvals','budgets','budget_entries','jobs'];
 const result:Record<string,unknown>={};
 for(const name of tables)result[name]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${name} t ORDER BY to_jsonb(t)::text`)).rows;
 return result;
}
it('durably dispatches the three pinned original agent IDs in order through mocked transport and prepares high-risk escalation',async()=>{
 const before=await financialState(),id=await start();
 for(let ordinal=1;ordinal<=3;ordinal++) {
  // A fresh coordinator per tick simulates process restart.
  await coordinator().runOnce();expect(calls).toHaveLength(ordinal);
  expect(calls[ordinal-1]).toMatchObject({agent:AGENT_IDS[ordinal-1],agent_version:settings.versions[ordinal-1],target:'webhook_target'});
  expect(calls[ordinal-1].event.input_message.message).toContain('Independently call custom__gate-mcp_GateGetRequest');
  if(ordinal>1)expect(calls[ordinal-1].event.input_message.message).toContain('advisoryFinding');
  await complete(id,ordinal,ordinal===2,ordinal===1?[{code:'FRAUD_INDICATOR',references:['proposal'],summary:'Fixture grounded concern.'}]:[]);
 }
 const result=await details(id);
 expect(result.run.status).toBe('HUMAN_REVIEW_REQUIRED');expect(result.run.escalation).toMatchObject({financialApproval:false,paymentExecution:false,status:'PREPARED'});
 expect(result.stages.every(s=>s.status==='SUCCEEDED'&&s.findings.traceId&&s.session_id)).toBe(true);
 expect(result.events).toHaveLength(6);expect(await financialState()).toEqual(before);
 expect((await service.get(p,requestId)).decision.agentReview).toMatchObject({status:'COMPLETED',runId:id,signals:[{code:'FRAUD_INDICATOR',stage:1}]});
 expect((await service.get(p,requestId)).decision).toMatchObject({riskScore:80,requiresHumanConsent:true});
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
 const stale={...gate,data:{...gate.data,version:gate.data.version+1}};
 await coordinator().receive(event(stage,'progress',stale));expect((await details(id)).run.error_code).toBe('STALE_REQUEST');
});
it('rejects unrestricted MCP proof, tool failures, mutation or unknown tool attempts and invented final findings',async()=>{
 for(const kind of ['unrestricted','tool-error','write-tool','unknown-tool','invented']) {
  const id=await start();await coordinator().runOnce();const stage=(await details(id)).stages[0],gate=await proof();
  if(kind==='unrestricted')delete (gate as any).access_mode;
  const payload=event(stage,'progress',kind==='tool-error'?{isError:true,...gate}:gate);
  if(kind==='write-tool')payload.ai_agent_response.progress!.skill_executed.skill_name='custom__gate-mcp_GateRequestSpend';
  if(kind==='unknown-tool')payload.ai_agent_response.progress!.skill_executed.skill_name='custom__gate-mcp_GateInventedTool';
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
it('exposes exactly six read-only tools on the orchestration endpoint and preserves the original catalog',async()=>{
 const before=await financialState(),app=createApp(db);
 const headers={host:'localhost:8000',authorization:`Bearer ${token}`,accept:'application/json, text/event-stream'};
 const call=async(url:string,method:string,params:any)=>{
  const response=await app.inject({method:'POST',url,headers,payload:{jsonrpc:'2.0',id:1,method,params}});expect(response.statusCode).toBe(200);return response.json().result;
 };
 try {
  const tools=await call('/mcp/orchestration','tools/list',{});
  expect(tools.tools.map((t:any)=>t.name).sort()).toEqual(ORCHESTRATION_READ_ONLY_TOOLS.map(tool=>tool.mcp).sort());
  expect((await call('/mcp','tools/list',{})).tools.some((t:any)=>t.name==='gate_request_spend')).toBe(true);
  const read=await call('/mcp/orchestration','tools/call',{name:'gate_get_request',arguments:{request_id:requestId}});
  expect(read.structuredContent).toMatchObject({access_mode:'orchestration_read_only',data:{id:requestId,policyVerdict:'REVIEW'}});
  const proposal=(await admin.query('SELECT proposal FROM requests WHERE id=$1',[requestId])).rows[0].proposal;
  const safeCalls:[string,any][]=[['gate_list_requests',{}],['gate_preview_spend',proposal],['gate_get_context',{source_domain:'pm',source_id:'GATE-ISSUE-404'}],
   ['gate_search_context',{query:'Morrow'}],['gate_catalog',{}]];
  for(const [name,args] of safeCalls) {
   const result=await call('/mcp/orchestration','tools/call',{name,arguments:args});
   if(result.isError)expect(JSON.parse(result.content[0].text).error.code).not.toBe('FORBIDDEN');
   else expect(result.structuredContent).toMatchObject({access_mode:'orchestration_read_only',mode:'sandbox',provider:'simulator'});
  }
  const response=await app.inject({method:'POST',url:'/mcp/orchestration',headers,payload:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'gate_request_spend',arguments:{}}}});
  expect(response.json().result?.isError??!!response.json().error).toBe(true);expect(await financialState()).toEqual(before);
 }finally{await app.close();}
});
it('requires three correctly associated version pins before enabling orchestration',()=>{
 expect(()=>configuration({DATABASE_URL:'postgresql://fixture/fixture',DEVREV_ORCHESTRATION_ENABLED:'true'})).toThrow();
 expect(configuration({DATABASE_URL:'postgresql://fixture/fixture'}).DEVREV_ORCHESTRATION_ENABLED).toBe(false);
 expect(()=>configuration({DATABASE_URL:'postgresql://fixture/fixture',DEVREV_DEMO_REVIEW_ENABLED:'true'})).toThrow();
});
it('isolates the shared demo start route behind its server secret, rate limit and sandbox identity',async()=>{
 const before=await financialState(),demoSettings={...settings,enabled:false,demoReviewEnabled:true},accessKey='fixture-demo-review-access-key-0123456789';
 const app=createApp(db,{orchestration:demoSettings,demoWorkspace:{orgId:p.orgId,principalId:demoP.id},demoReview:{enabled:true,accessKey},
  browserHosts:['gate.test'],origins:['https://demo.example']});
 const headers={'content-type':'application/json',host:'gate.test',origin:'https://demo.example','sec-fetch-site':'same-origin',
  'idempotency-key':randomUUID(),'x-gate-demo-review-key':accessKey};
 try {
  const missing=await app.inject({method:'POST',url:`/v1/demo/transactions/${requestId}/orchestration`,headers:{...headers,'x-gate-demo-review-key':''},payload:{}});
  expect(missing.statusCode,missing.body).toBe(401);
  const attemptedApproval=await app.inject({method:'POST',url:`/v1/demo/transactions/${requestId}/orchestration`,headers,payload:{choice:'approve'}});
  expect(attemptedApproval.statusCode).toBe(400);
  const unknownRequest=await app.inject({method:'POST',url:`/v1/demo/transactions/${randomUUID()}/orchestration`,headers:{...headers,'idempotency-key':randomUUID()},payload:{}});
  expect(unknownRequest.statusCode).toBe(404);
  expect(await financialState()).toEqual(before);
 } finally {await app.close();}
});
it('starts only a demo-marked review while general orchestration stays disabled and limits duplicate requests',async()=>{
 const before=await financialState(),demoSettings={...settings,enabled:false,demoReviewEnabled:true},accessKey='fixture-demo-review-access-key-0123456789',key=randomUUID();
 const app=createApp(db,{orchestration:demoSettings,demoWorkspace:{orgId:p.orgId,principalId:demoP.id},demoReview:{enabled:true,accessKey},
  browserHosts:['gate.test'],origins:['https://demo.example']});
 const headers={'content-type':'application/json',host:'gate.test',origin:'https://demo.example','sec-fetch-site':'same-origin',
  'idempotency-key':key,'x-gate-demo-review-key':accessKey};
 try {
  const started=await app.inject({method:'POST',url:`/v1/demo/transactions/${requestId}/orchestration`,headers,payload:{}});
  expect(started.statusCode,started.body).toBe(202);const id=started.json().data.runId;
  expect(started.json().data).toMatchObject({financialApproval:false,paymentExecution:false});
  const run=(await admin.query('SELECT * FROM orchestration_runs WHERE id=$1',[id])).rows[0];
  expect(run).toMatchObject({status:'RUNNING',initiator_type:'DEMO_REVIEW',created_by:demoP.id,created_credential_id:null,idempotency_key:`demo:${key}`});
  const replay=await app.inject({method:'POST',url:`/v1/demo/transactions/${requestId}/orchestration`,headers,payload:{}});
  expect(replay.statusCode).toBe(202);expect(replay.json().data.runId).toBe(id);
  await app.inject({method:'POST',url:`/v1/demo/transactions/${requestId}/orchestration`,headers:{...headers,'idempotency-key':randomUUID()},payload:{}});
  const throttled=await app.inject({method:'POST',url:`/v1/demo/transactions/${requestId}/orchestration`,headers:{...headers,'idempotency-key':randomUUID()},payload:{}});
  expect(throttled.statusCode).toBe(429);
  const current=(await service.get(demoP,requestId));
  expect(current.decision.agentReview).toMatchObject({status:'PENDING',runId:id});
  expect((await financialState())).toEqual(before);
  const demoCoordinator=new OrchestrationCoordinator(db,service,demoSettings,transport);
  expect(await demoCoordinator.runOnce()).toBe(true);expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({agent:AGENT_IDS[0],agent_version:settings.versions[0]});
  const state=await demoCoordinator.getDemo(demoP,id);
  expect(state.stages[0]).toMatchObject({status:'WAITING',dispatch_confirmed:true});
  expect(await financialState()).toEqual(before);
 } finally {await app.close();}
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
it('automatically queues a durable read-only run when an authenticated purchase request is submitted',async()=>{
 const app=createApp(db,{orchestration:settings,browserHosts:['localhost:8000']}),key=randomUUID(),createdIds:string[]=[];
 try{
  const proposal=(await admin.query('SELECT proposal FROM requests WHERE id=$1',[requestId])).rows[0].proposal;
  const response=await app.inject({method:'POST',url:'/v1/requests',headers:{host:'localhost:8000',authorization:`Bearer ${token}`,'idempotency-key':key},payload:proposal});
  expect(response.statusCode).toBe(201);createdIds.push(response.json().data.id);
  expect(response.json().data.decision.agentReview).toMatchObject({status:'PENDING',runId:expect.any(String)});
  const mcp=await app.inject({method:'POST',url:'/mcp',headers:{host:'localhost:8000',authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},
   payload:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'gate_request_spend',arguments:{...proposal,idempotency_key:randomUUID()}}}});
  expect(mcp.statusCode).toBe(200);createdIds.push(JSON.parse(mcp.json().result.content[0].text).data.id);
  for(const createdId of createdIds){
   const run=(await admin.query('SELECT * FROM orchestration_runs WHERE org_id=$1 AND request_id=$2',[p.orgId,createdId])).rows[0];
   expect(run).toMatchObject({status:'RUNNING',current_stage:1,idempotency_key:`auto:${createdId}`});
   expect((await admin.query('SELECT status,agent_version FROM orchestration_stages WHERE org_id=$1 AND run_id=$2 ORDER BY ordinal',[p.orgId,run.id])).rows)
    .toMatchObject(settings.versions.map(agent_version=>({status:'READY',agent_version})));
   expect((await admin.query("SELECT decision->'agentReview'->>'status' AS status,decision->'agentReview'->>'runId' AS run_id FROM requests WHERE org_id=$1 AND id=$2",[p.orgId,createdId])).rows[0])
    .toEqual({status:'PENDING',run_id:run.id});
   expect((await admin.query('SELECT count(*)::int AS count FROM payments WHERE org_id=$1 AND request_id=$2',[p.orgId,createdId])).rows[0].count).toBe(0);
  }
 }finally{
  await app.close();
  if(createdIds.length)await transaction(admin,p.orgId,async tx=>{
   for(const createdId of createdIds){
    await tx.query('DELETE FROM orchestration_events WHERE org_id=$1 AND stage_id IN (SELECT id FROM orchestration_stages WHERE org_id=$1 AND run_id IN (SELECT id FROM orchestration_runs WHERE org_id=$1 AND request_id=$2))',[p.orgId,createdId]);
    await tx.query('DELETE FROM orchestration_stages WHERE org_id=$1 AND run_id IN (SELECT id FROM orchestration_runs WHERE org_id=$1 AND request_id=$2)',[p.orgId,createdId]);
    await tx.query('DELETE FROM orchestration_runs WHERE org_id=$1 AND request_id=$2',[p.orgId,createdId]);
    await tx.query('DELETE FROM request_revisions WHERE org_id=$1 AND request_id=$2',[p.orgId,createdId]);
    await tx.query('DELETE FROM investigations WHERE org_id=$1 AND request_id=$2',[p.orgId,createdId]);
    await tx.query('DELETE FROM requests WHERE org_id=$1 AND id=$2',[p.orgId,createdId]);
   }
   await tx.query("DELETE FROM idempotency_records WHERE org_id=$1 AND principal_id=$2 AND operation='request.create' AND key=$3",[p.orgId,p.id,key]);
  });
 }
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
 for(const kind of ['write-skill','missing-tool','unknown-tool','republished']) {
  const adapter:typeof fetch=async(url,init)=>{
   if(String(url).endsWith('ai-agents.get')) {
    let skills:{name:string}[]=ORCHESTRATION_READ_ONLY_TOOLS.map(tool=>({name:tool.agent}));
    if(kind==='write-skill')skills=[...skills,{name:'GateRequestSpend'}];
    if(kind==='missing-tool')skills=skills.slice(1);
    if(kind==='unknown-tool')skills=[...skills,{name:'GateUnknown'}];
    return new Response(JSON.stringify({agent:{id:AGENT_IDS[0],
    default_version_id:{id:kind==='republished'?`${AGENT_IDS[0]}:ai_agent_version/4.2`:settings.versions[0]},
    skills}}));
   }
   return transport(url,init);
  };
  const c=new OrchestrationCoordinator(db,service,settings,adapter),id=(await c.start(p,requestId,randomUUID())).runId;
  await c.runOnce();expect((await c.get(p,id)).run.error_code).toBe('SAFE_AGENT_VERSION_REQUIRED');expect(calls).toHaveLength(0);
 }
});
it('accepts the other five allowlisted tools but still requires successful GateGetRequest before advancing',async()=>{
 const id=await start();await coordinator().runOnce();
 for(const tool of ORCHESTRATION_READ_ONLY_TOOLS.filter(tool=>tool.mcp!=='gate_get_request')) {
  const stage=(await details(id)).stages[0],output={mode:'sandbox',provider:'simulator',access_mode:'orchestration_read_only',
   trace_id:randomUUID(),server_version:'0.4.1',data:{readOnlyFixture:true}};
  await coordinator().receive(event(stage,'progress',output,`custom__gate-mcp_${tool.agent}`));
  const after=await details(id);expect(after.run.current_stage).toBe(1);expect(after.stages[0].tool_result).toBeNull();
 }
 const done=await complete(id,1);
 expect((await details(id)).run.current_stage).toBe(2);
 const events=(await details(id)).events;
 expect(events.filter((item:any)=>item.event.toolTraceId).map((item:any)=>item.event.toolTraceId)).toHaveLength(6);
 expect(events.some((item:any)=>item.event.toolName==='custom__gate-mcp_GateCatalog')).toBe(true);
 expect(done.stage.status).toBe('WAITING');
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
it('automatically authorizes an eligible low-risk request only after all three agents complete',async()=>{
 const original=(await admin.query('SELECT proposal,decision,evidence,amount_minor,status FROM requests WHERE id=$1',[requestId])).rows[0];
 const proposal={...original.proposal,amountMinor:'5000',purpose:'Eligible automatic orchestration fixture'};
 const evidence={...original.evidence,complete:true,missing:[],unresolvedRequirements:[],bundleHash:'fixture-complete-evidence'};
 await admin.query('UPDATE requests SET proposal=$2,amount_minor=$3,decision=$4,evidence=$5,status=$6 WHERE id=$1',
  [requestId,proposal,'5000',initialDecision,evidence,'AWAITING_EVIDENCE']);
 try {
  const autoService=new GateService(db,{devrevOrchestrationEnabled:true});
  const autoCoordinator=new OrchestrationCoordinator(db,autoService,settings,transport);
  const before=await financialState(),id=(await autoCoordinator.startAutomatic(p,requestId)).runId;
  for(let ordinal=1;ordinal<=3;ordinal++){
   await autoCoordinator.runOnce();
   if(ordinal<3)expect(await financialState()).toEqual(before);
   await complete(id,ordinal,false,[],autoCoordinator);
  }
  const result=await autoCoordinator.get(p,id),request=await autoService.get(p,requestId);
  expect((await admin.query('SELECT idempotency_key FROM orchestration_runs WHERE org_id=$1 AND id=$2',[p.orgId,id])).rows[0].idempotency_key).toBe(`auto:${requestId}`);
  const audit=(await admin.query("SELECT packet->'details'->>'automaticAuthorization' AS automatic FROM audit_events WHERE packet->>'event'='devrev.review_completed' AND packet->>'resourceId'=$1 ORDER BY sequence DESC LIMIT 1",[requestId])).rows[0];
  expect(audit.automatic).toBe('true');
  expect(result.run.status).toBe('COMPLETED');expect(result.run.escalation).toBeNull();
  expect(request.decision).toMatchObject({executionAllowed:true,requiresHumanConsent:false,reviewRequirements:[]});
  expect(request).toMatchObject({workflowStatus:'AUTHORIZED',decision:{verdict:'APPROVE',riskScore:0,agentReview:{status:'COMPLETED'}},
   payment:{status:'QUEUED',holdState:'HELD',receipt:null}});
  expect((await admin.query('SELECT state FROM authorizations WHERE org_id=$1 AND request_id=$2',[p.orgId,requestId])).rows).toEqual([{state:'READY'}]);
  expect((await admin.query('SELECT count(*)::int AS count FROM approvals WHERE org_id=$1 AND request_id=$2',[p.orgId,requestId])).rows[0].count).toBe(0);
  expect((await admin.query('SELECT dispatched_at FROM payments WHERE org_id=$1 AND request_id=$2',[p.orgId,requestId])).rows[0].dispatched_at).toBeNull();
 }finally{
  await transaction(admin,p.orgId,async tx=>{
   await tx.query('UPDATE budgets b SET reserved_minor=b.reserved_minor-p.amount_minor FROM payments p WHERE p.org_id=$1 AND p.request_id=$2 AND b.org_id=p.org_id AND b.id=p.budget_id',[p.orgId,requestId]);
   await tx.query('DELETE FROM jobs WHERE org_id=$1 AND payment_id IN (SELECT id FROM payments WHERE org_id=$1 AND request_id=$2)',[p.orgId,requestId]);
   await tx.query('DELETE FROM authorizations WHERE org_id=$1 AND request_id=$2',[p.orgId,requestId]);
   await tx.query('DELETE FROM budget_entries WHERE org_id=$1 AND payment_id IN (SELECT id FROM payments WHERE org_id=$1 AND request_id=$2)',[p.orgId,requestId]);
   await tx.query('DELETE FROM payments WHERE org_id=$1 AND request_id=$2',[p.orgId,requestId]);
   await tx.query('UPDATE requests SET proposal=$2,decision=$3,evidence=$4,amount_minor=$5,status=$6 WHERE id=$1',
    [requestId,original.proposal,original.decision,original.evidence,original.amount_minor,original.status]);
  });
 }
});

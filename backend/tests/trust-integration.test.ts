/** Real PostgreSQL verifies threshold, concurrent duplicate review, and automatic sandbox capture. */
import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from '../src/db.js';
import { migrate } from '../scripts/migrate.js';
import { seedControls } from '../scripts/seed.js';
import { importEvidence } from '../scripts/import.js';
import { readFile } from 'node:fs/promises';
import { GateService } from '../src/service.js';
import { GateWorker } from '../src/worker.js';
import { createApp } from '../src/app.js';
import { labelTrustHistory } from '../src/trust-store.js';
import { TrustWorker } from '../src/trust-worker.js';
import { transaction } from '../src/db.js';
import { hash } from '../src/hash.js';
import type { TrustResponse,TrustInput } from '../src/trust-contracts.js';
import { validateTrustResponse } from '../src/trust-contracts.js';
import type { Principal, Proposal } from '../src/contracts.js';
const port=56000+process.pid%1000;
const pg=new EmbeddedPostgres({databaseDir:`work/trust-test-${randomUUID()}`,user:'trust_test',password:'isolated_test_only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let admin:Pool,runtime:Pool,service:GateService,p:Principal,proposal:Proposal;
beforeAll(async()=>{
 await pg.initialise();await pg.start();await pg.createDatabase('trust_tests');
 const connectionString=`postgresql://trust_test:isolated_test_only@127.0.0.1:${port}/trust_tests`;
 admin=new Pool({connectionString});await migrate(admin);const controls=await seedControls(admin);
 const restricted=randomUUID();await admin.query("INSERT INTO projects VALUES($1,$2,'Test restricted')",[restricted,controls.orgId]);
 await importEvidence(admin,controls.orgId,controls.projectId,'data/synthetic',JSON.parse(await readFile('data/synthetic/manifest.json','utf8')),restricted);
 const owner=(await admin.query("SELECT p.*,c.id AS credential_id FROM principals p JOIN credentials c ON c.principal_id=p.id WHERE p.org_id=$1 AND p.role='OPERATOR' ORDER BY p.name LIMIT 1",[controls.orgId])).rows[0];
 const agent=(await admin.query('SELECT id FROM agents WHERE org_id=$1 AND owner_id=$2',[controls.orgId,owner.id])).rows[0];
 const merchant=(await admin.query("SELECT id FROM merchants WHERE org_id=$1 AND status='ALLOWED'",[controls.orgId])).rows[0];
 p={id:owner.id,orgId:owner.org_id,credentialId:owner.credential_id,role:'OPERATOR',approvalLimitMinor:'0'};
 proposal={agentId:agent.id,projectId:controls.projectId,merchantId:merchant.id,amountMinor:'20000',currency:'USD',category:'diagnostics',purpose:'Test trust authorization',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}};
 runtime=new Pool({connectionString,options:'-c role=gate_runtime'});service=new GateService(runtime,{trustEnabled:true,trustTimeoutSeconds:60});
});
afterAll(async()=>{await runtime?.end();await admin?.end();await pg.stop();});
const settings={enabled:true,timeoutSeconds:60,apiToken:'test-only-token',agentId:'don:core:dvrv-us-1:devo/test:ai_agent/6',
 webhookId:'don:integration:dvrv-us-1:devo/test:webhook/test',webhookSecret:'test-only-secret-'.repeat(4)};
let posted:any;
const transport:typeof fetch=async(_url,init)=>{posted=JSON.parse(String(init?.body));return new Response('{}',{status:200});};
const trust=()=>new TrustWorker(runtime,service,settings,transport);
async function create(amount='20101') {return service.create(p,{...proposal,amountMinor:amount,purpose:randomUUID()},randomUUID());}
async function send(id:string){
 await trust().runOnce();
 const assessment=(await admin.query('SELECT * FROM trust_assessments WHERE request_id=$1',[id])).rows[0];
 expect(assessment.status).toBe('SENT');return assessment;
}
function callback(a:any,message:any) {return {payload:{type:'ai_agent_response',ai_agent_response:{agent:settings.agentId,
 session_object:`gate-trust:${a.id}`,agent_response:'message',client_metadata:{orgId:a.org_id,requestId:a.request_id,assessmentId:a.id,inputHash:a.input_hash},message:JSON.stringify(message)}}};}
const neutral=(id:string)=>({requestId:id,assessmentStatus:'INSUFFICIENT_HISTORY',dataLabel:'GATE_STORED_HISTORY',signals:[],unresolvedQuestions:[]});
it('waits for the authenticated agent result before authorizing a low-risk payment; duplicates create no extra payments',async()=>{
 const request=await create();expect(request).toMatchObject({workflowStatus:'AWAITING_EVIDENCE',decision:{verdict:'REVIEW',executionAllowed:false},payment:null});
 const a=await send(request.id);
 expect(posted).toMatchObject({agent:settings.agentId,session_object:`gate-trust:${a.id}`,webhook_target:{webhook:settings.webhookId}});
 expect(posted.event.input_message.message).not.toContain(settings.apiToken);
 const app=createApp(runtime,{trust:settings});
 try {
  const payload=callback(a,neutral(request.id));
  expect((await app.inject({method:'POST',url:'/v1/integrations/devrev/trust/webhook',payload})).statusCode).toBe(401);
  const headers={'x-api-key':settings.webhookSecret};
  expect((await app.inject({method:'POST',url:'/v1/integrations/devrev/trust/webhook',headers,payload:{type:'verify',challenge:'test-challenge'}})).json()).toEqual({challenge:'test-challenge'});
  expect((await app.inject({method:'POST',url:'/v1/integrations/devrev/trust/webhook',headers,payload})).json()).toEqual({processed:true});
  expect((await app.inject({method:'POST',url:'/v1/integrations/devrev/trust/webhook',headers,payload})).json()).toEqual({processed:false});
 }finally{await app.close();}
 expect((await service.get(p,request.id))).toMatchObject({workflowStatus:'AUTHORIZED',trustAssessment:{status:'COMPLETED',adjustment:0},decision:{verdict:'APPROVE'}});
 expect((await admin.query('SELECT count(*) FROM payments WHERE request_id=$1',[request.id])).rows[0].count).toBe('1');
 await new GateWorker(runtime).runOnce();expect((await service.get(p,request.id)).workflowStatus).toBe('COMPLETED');
});
it('keeps amount and simultaneous duplicate rules mandatory even with a valid negative trust adjustment',async()=>{
 for(const amount of ['100001','22101']){
  const request=await create(amount),a=await send(request.id);
  const snapshot=a.input as TrustInput;
  // Independent labels stand in for already reviewed history, not successful payment alone.
  const history=Array.from({length:3},()=>({transactionId:randomUUID(),agentId:proposal.agentId,merchantId:proposal.merchantId,category:proposal.category,
   amountMinor:amount,currency:'USD' as const,outcome:'SUCCEEDED',legitimacyReview:'CONFIRMED_LEGITIMATE' as const,createdAt:new Date().toISOString(),dataLabel:'SYNTHETIC_DEMO_DATA' as const}));
  const input={...snapshot,history};
  await admin.query('UPDATE trust_assessments SET input=$2,input_hash=$3 WHERE id=$1',[a.id,input,hash(input)]);a.input_hash=hash(input);
  if(amount==='22101')await new GateService(runtime).create(p,{...proposal,amountMinor:amount,purpose:(await service.get(p,request.id)).proposal.purpose},randomUUID());
  const message={...neutral(request.id),assessmentStatus:'SUFFICIENT',signals:[{code:'ESTABLISHED_REVIEWED_PATTERN',direction:'DECREASE',supportingTransactionIds:history.map(h=>h.transactionId),explanation:'Three explicitly confirmed examples'}]};
  await trust().receive(callback(a,message));
  expect(await service.get(p,request.id)).toMatchObject({workflowStatus:'AWAITING_CONSENT',decision:{verdict:'REVIEW',requiresHumanConsent:true},trustAssessment:{adjustment:-10}});
  expect((await admin.query('SELECT count(*) FROM payments WHERE request_id=$1',[request.id])).rows[0].count).toBe('0');
 }
});
it('fails invented citations closed to review and fences cross-tenant or wrong-agent callback metadata',async()=>{
 const request=await create('23001'),a=await send(request.id),event=callback(a,neutral(request.id));
 const badAgent=structuredClone(event);badAgent.payload.ai_agent_response.agent='wrong-agent';
 await expect(trust().receive(badAgent)).rejects.toMatchObject({code:'INVALID_TRUST_EVENT'});
 const badOrg=structuredClone(event);badOrg.payload.ai_agent_response.client_metadata.orgId=randomUUID();
 await expect(trust().receive(badOrg)).rejects.toMatchObject({code:'INVALID_TRUST_EVENT'});
 await trust().receive(callback(a,{...neutral(request.id),assessmentStatus:'SUFFICIENT',signals:[{code:'UNUSUAL_AMOUNT',direction:'INCREASE',supportingTransactionIds:[randomUUID()],explanation:'Invented'}]}));
 expect(await service.get(p,request.id)).toMatchObject({workflowStatus:'AWAITING_CONSENT',trustAssessment:{status:'FAILED',failure_code:'INVALID_AGENT_RESPONSE'},decision:{requiresHumanConsent:true}});
});
it('expires missing callbacks into review, ignores late results, and never reopens a cancelled request',async()=>{
 const request=await create('24001'),a=await send(request.id);
 await admin.query("UPDATE trust_assessments SET expires_at=now()-interval '1 second' WHERE id=$1",[a.id]);
 await trust().runOnce();expect(await service.get(p,request.id)).toMatchObject({workflowStatus:'AWAITING_CONSENT',trustAssessment:{status:'TIMED_OUT'}});
 expect(await trust().receive(callback(a,neutral(request.id)))).toEqual({processed:false});
 const cancelled=await create('24002'),b=await send(cancelled.id);await service.cancel(p,cancelled.id,randomUUID());
 await trust().receive(callback(b,neutral(cancelled.id)));expect(await service.get(p,cancelled.id)).toMatchObject({workflowStatus:'CANCELLED',payment:null,trustAssessment:{failure_code:'STALE_REQUEST'}});
});
it('durably fails network errors and preserves tenant-scoped history and labels',async()=>{
 const request=await create('25001');
 const worker=new TrustWorker(runtime,service,settings,async()=>{throw new Error('private-provider-body');});
 await worker.runOnce();expect(await service.get(p,request.id)).toMatchObject({workflowStatus:'AWAITING_CONSENT',trustAssessment:{failure_code:'DEVREV_API_UNAVAILABLE'}});
 const a=(await admin.query('SELECT input FROM trust_assessments WHERE request_id=$1',[request.id])).rows[0].input as TrustInput;
 expect(a.history.every(h=>h.agentId===proposal.agentId&&h.legitimacyReview==='UNREVIEWED')).toBe(true);
 await transaction(runtime,randomUUID(),async tx=>{expect((await tx.query('SELECT * FROM trust_assessments')).rows).toHaveLength(0);});
});

it('requires an independent finance label before a successful purchase can lower future risk',async()=>{
 const row=(await admin.query("SELECT * FROM principals WHERE org_id=$1 AND role='FINANCE'",[p.orgId])).rows[0];
 const finance:Principal={id:row.id,orgId:p.orgId,credentialId:'',role:'FINANCE',approvalLimitMinor:row.approval_limit_minor};
 const request=(await admin.query("SELECT request_id FROM payments WHERE status='SUCCEEDED' ORDER BY created_at LIMIT 1")).rows[0].request_id;
 const input={legitimacy:'CONFIRMED_LEGITIMATE',reason:'Independent review of synthetic settled purchase'};
 await expect(labelTrustHistory(runtime,p,request,input,randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});
 const key=randomUUID();expect(await labelTrustHistory(runtime,finance,request,input,key)).toMatchObject({legitimacy:'CONFIRMED_LEGITIMATE'});
 expect(await labelTrustHistory(runtime,finance,request,input,key)).toMatchObject({legitimacy:'CONFIRMED_LEGITIMATE'});
 await expect(labelTrustHistory(runtime,finance,request,input,randomUUID())).rejects.toMatchObject({code:'ALREADY_LABELED'});
 const next=await create('25002'),snapshot=(await admin.query('SELECT input FROM trust_assessments WHERE request_id=$1',[next.id])).rows[0].input as TrustInput;
 expect(snapshot.history.find(h=>h.transactionId===request)?.legitimacyReview).toBe('CONFIRMED_LEGITIMATE');
});

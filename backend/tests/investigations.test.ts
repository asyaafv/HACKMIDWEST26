/** Real PostgreSQL and MCP checks cover Gatekeeper fencing, provenance, reevaluation and review history. */
import { beforeAll,afterAll,it,expect } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Pool,type DB } from '../src/db.js';
import { migrate } from '../scripts/migrate.js';
import { prepareDemo,seedControls } from '../scripts/seed.js';
import { authenticate } from '../src/auth.js';
import { provisionGatekeeper } from '../src/identity.js';
import { GateService } from '../src/service.js';
import { Investigations } from '../src/investigations.js';
import { createApp } from '../src/app.js';
import { demoPrincipal,reviewTransaction } from '../src/transaction-review.js';
import type { Principal } from '../src/contracts.js';
import { collectEvidence } from '../src/evidence.js';
import { transaction } from '../src/db.js';
import { simulatePurchase } from '../src/simulation.js';
import { verifyChain } from '../src/audit.js';
const port=59000+process.pid%500;
const pg=new EmbeddedPostgres({databaseDir:`work/investigations-${randomUUID()}`,user:'investigation_test',password:'isolated_only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let admin:DB,runtime:DB,service:GateService,flow:Investigations,controls:Awaited<ReturnType<typeof seedControls>>,buyer:Principal,finance:Principal,keeper:Principal,otherKeeper:Principal;
let app:ReturnType<typeof createApp>,client:Client;
const proposal=()=>({agentId:controls.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'174235',currency:'USD',category:'diagnostics',purpose:'Investigation test proposal',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}});
async function create(){return service.create(buyer,proposal(),randomUUID());}
async function reportFor(id:string){const row=await service.get(finance,id);const bundle=await transaction(runtime,finance.orgId,tx=>collectEvidence(tx,finance,row.proposal));return {sources:bundle.items.map(s=>({domain:s.domain,sourceId:s.sourceId,sourceHash:s.sourceHash,contentHash:s.contentHash})),links:bundle.links,unresolvedQuestions:[] as string[]};}
async function review(id:string,choice:'approve'|'reject') {const row=(await service.dashboard(finance)).requests.find(r=>r.id===id)!;return reviewTransaction(runtime,finance,id,{choice,reason:'Reviewed current enterprise evidence',expectedVersion:row.version,snapshotHash:row.snapshotHash},randomUUID());}
beforeAll(async()=>{
 await pg.initialise();await pg.start();await pg.createDatabase('investigations');
 const connectionString=`postgresql://investigation_test:isolated_only@127.0.0.1:${port}/investigations`;
 admin=new Pool({connectionString});await migrate(admin);runtime=new Pool({connectionString,options:'-c role=gate_runtime'});
 controls=await seedControls(admin);await prepareDemo(admin);service=new GateService(runtime);flow=new Investigations(runtime,service);
 buyer=await authenticate(runtime,`Bearer ${controls.identities.OPERATOR!.token}`);finance=await demoPrincipal(runtime,{orgId:controls.orgId,principalId:controls.identities.FINANCE!.id});
 const provisioned=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Evidence Gatekeeper',investigator:true});
 keeper=await authenticate(runtime,`Bearer ${provisioned.token}`);
 const second=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Competing Gatekeeper',investigator:true});otherKeeper=await authenticate(runtime,`Bearer ${second.token}`);
 app=createApp(runtime,{mcpHosts:[]});const base=await app.listen({host:'127.0.0.1',port:0});await app.close();app=createApp(runtime,{mcpHosts:[new URL(base).host]});await app.listen({host:'127.0.0.1',port:Number(new URL(base).port)});
 client=new Client({name:'investigation acceptance',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${provisioned.token}`}}}));
});
afterAll(async()=>{await client?.close();await app?.close();await runtime?.end();await admin?.end();await pg.stop();});
it('queues a proposal, denies premature review, and completes a real scoped MCP evidence handoff',async()=>{
 const request=await create();expect((await service.get(finance,request.id)).investigation.status).toBe('WAITING');
 await expect(review(request.id,'approve')).rejects.toMatchObject({code:'INVESTIGATION_PENDING'});
 const listed=await client.callTool({name:'gate_list_investigations',arguments:{limit:20}});expect(JSON.stringify(listed.structuredContent)).toContain(request.id);
 const started=await client.callTool({name:'gate_start_investigation',arguments:{request_id:request.id,expectedVersion:1,idempotency_key:randomUUID()}});expect(started.isError).not.toBe(true);
 const inv=(started.structuredContent as any).data;
 const scoped=await client.callTool({name:'gate_get_request',arguments:{request_id:request.id}});expect((scoped.structuredContent as any).data.id).toBe(request.id);
 const submitted=await client.callTool({name:'gate_submit_evidence',arguments:{request_id:request.id,expectedVersion:1,runId:inv.run_id,report:await reportFor(request.id),idempotency_key:randomUUID()}});expect(submitted.isError).not.toBe(true);
 const result=await service.get(finance,request.id);expect(result.version).toBe(2);expect(result.investigation).toMatchObject({status:'EVALUATED',mode:'GATEKEEPER',actor_id:keeper.id});
 expect(result.evidence.complete).toBe(true);await review(request.id,'approve');
 for(const table of ['payments','jobs','budget_entries'])expect((await admin.query(`SELECT count(*) FROM ${table}`)).rows[0].count).toBe('0');
});
it('returns a low-risk backend decision through MCP and validates it without changing the request',async()=>{
 const request=await service.create(buyer,{...proposal(),amountMinor:'12001',purpose:'Low risk MCP decision acceptance'},randomUUID());
 // Complete low-risk evidence authorizes immediately under policy v3 and later.
 expect(request).toMatchObject({workflowStatus:'AUTHORIZED',decision:{verdict:'APPROVE',riskScore:0,riskAssessment:{level:'LOW',lowRisk:true,computedBy:'BACKEND_POLICY'}}});
 const blocked=await client.callTool({name:'gate_start_investigation',arguments:{request_id:request.id,expectedVersion:1,idempotency_key:randomUUID()}});
 expect(blocked.isError).toBe(true); // Evidence investigations cannot rewrite a financial authorization.
 const validated=await client.callTool({name:'gate_get_request',arguments:{request_id:request.id,validate_decision:true}});
 expect(validated.isError).not.toBe(true);
 expect((validated.structuredContent as any).data.validation).toMatchObject({requestVersion:1,decision:{verdict:'APPROVE',riskScore:0},paymentExecution:false});
 const before=await service.get(finance,request.id);
 await admin.query('UPDATE budgets SET limit_minor=reserved_minor+spent_minor WHERE org_id=$1',[controls.orgId]);
 try {
  const validation=await service.validateDecision(finance,request.id);
  expect(validation).toMatchObject({status:'CHANGED',decision:{verdict:'REJECT',riskAssessment:{lowRisk:false,level:'BLOCKED'}}});
  expect(validation.reasons).toContain('POLICY_FINDINGS_CHANGED');
  expect(await service.get(finance,request.id)).toEqual(before);
 } finally {await admin.query('UPDATE budgets SET limit_minor=1000000 WHERE org_id=$1',[controls.orgId]);}
 for(const table of ['payments','jobs','budget_entries'])expect((await admin.query(`SELECT count(*) FROM ${table}`)).rows[0].count).toBe('1');
});
it('serializes competing claims, retains same-key replay, and fences expired runs',async()=>{
 const request=await create(),key=randomUUID();
 const [one,replay]=await Promise.all([flow.start(keeper,request.id,{expectedVersion:1},key),flow.start(keeper,request.id,{expectedVersion:1},key)]);expect(replay.run_id).toBe(one.run_id);
 await expect(flow.start(otherKeeper,request.id,{expectedVersion:1},randomUUID())).rejects.toMatchObject({code:'INVESTIGATION_BUSY'});
 await admin.query("UPDATE investigations SET lease_until=now()-interval '1 second' WHERE request_id=$1",[request.id]);
 const claimed=await flow.start(otherKeeper,request.id,{expectedVersion:1},randomUUID());expect(claimed.run_id).not.toBe(one.run_id);
 await expect(flow.submit(keeper,request.id,{expectedVersion:1,runId:one.run_id,report:await reportFor(request.id)},randomUUID())).rejects.toMatchObject({code:'STALE_INVESTIGATION'});
 await flow.fail(otherKeeper,request.id,{expectedVersion:1,runId:claimed.run_id,reason:'Upstream context unavailable'},randomUUID());expect((await service.get(finance,request.id)).investigation.failure_reason).toBe('Upstream context unavailable');
});
it('rejects forged citations/relationships and leaves the prior evaluation intact',async()=>{
 const request=await create(),inv=await flow.start(keeper,request.id,{expectedVersion:1},randomUUID()),report=await reportFor(request.id);
 await expect(flow.submit(keeper,request.id,{expectedVersion:1,runId:inv.run_id,report:{...report,sources:[{...report.sources[0],sourceHash:'0'.repeat(64)}]}},randomUUID())).rejects.toMatchObject({code:'STALE_SOURCE'});
 await expect(flow.submit(keeper,request.id,{expectedVersion:1,runId:inv.run_id,report:{...report,links:[{...report.links[0],basisPointer:'/invented'}]}},randomUUID())).rejects.toMatchObject({code:'UNVERIFIED_RELATIONSHIP'});
 expect((await service.get(finance,request.id)).version).toBe(1);expect((await service.evaluationHistory(finance,request.id)).items).toHaveLength(1);
});
it('keeps unresolved questions incomplete, then archives reevaluation and distinct reviews',async()=>{
 const request=await create(),inv=await flow.start(keeper,request.id,{expectedVersion:1},randomUUID()),report=await reportFor(request.id),key=randomUUID();
 const body={expectedVersion:1,runId:inv.run_id,report:{...report,unresolvedQuestions:['Has the company already purchased this tool?']}};
 const result=await flow.submit(keeper,request.id,body,key);expect((await flow.submit(keeper,request.id,body,key)).requestVersion).toBe(result.requestVersion);
 expect((await service.get(finance,request.id)).evidence.complete).toBe(false);await expect(review(request.id,'approve')).rejects.toMatchObject({code:'POLICY_BLOCKED'});await review(request.id,'reject');
 const next=await flow.start(keeper,request.id,{expectedVersion:2},randomUUID());
 await flow.submit(keeper,request.id,{expectedVersion:2,runId:next.run_id,report:await reportFor(request.id)},randomUUID());await review(request.id,'approve');
 const history=await service.evaluationHistory(finance,request.id);expect(history.items.map(r=>r.version)).toEqual([3,2,1]);expect(history.items[1]!.unresolvedQuestions).toHaveLength(1);
 expect(history.items[0]!.review?.choice).toBe('approve');expect(history.items[1]!.review?.choice).toBe('reject');
});
it('denies purchasing identities and out-of-scope investigators',async()=>{
 const request=await create();
 const agent=(await service.catalog(finance)).agents.find(a=>a.owner_id===keeper.id);expect(agent.can_purchase).toBe(false);
 await expect(simulatePurchase(runtime,service,finance,{...proposal(),agentId:agent.id},randomUUID())).rejects.toMatchObject({code:'SIMULATION_UNAVAILABLE'});
 await expect(flow.start(buyer,request.id,{expectedVersion:1},randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});
 const projectId=randomUUID();await admin.query("INSERT INTO projects VALUES($1,$2,'Restricted investigator project')",[projectId,controls.orgId]);
 const outsider=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId,name:'Restricted keeper',investigator:true}),p=await authenticate(runtime,`Bearer ${outsider.token}`);
 expect((await flow.list(p)).items).toHaveLength(0);await expect(flow.start(p,request.id,{expectedVersion:1},randomUUID())).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(service.validateDecision(p,request.id)).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('records local failure honestly and permits a fresh retry after source recovery',async()=>{
 const request=await create();await admin.query("UPDATE source_records SET source_id='TEMPORARILY_UNAVAILABLE' WHERE org_id=$1 AND source_id='GATE-ISSUE-101'",[controls.orgId]);
 try{const failed=await flow.localRun(finance,request.id,{expectedVersion:1},randomUUID());expect(failed.investigation.status).toBe('FAILED');expect(failed.version).toBe(1);}
 finally{await admin.query("UPDATE source_records SET source_id='GATE-ISSUE-101' WHERE org_id=$1 AND source_id='TEMPORARILY_UNAVAILABLE'",[controls.orgId]);}
 expect((await flow.localRun(finance,request.id,{expectedVersion:1},randomUUID())).investigation.status).toBe('EVALUATED');
 const rows=(await admin.query('SELECT * FROM audit_events WHERE org_id=$1 ORDER BY sequence',[controls.orgId])).rows;
 const head=(await admin.query('SELECT head_hash FROM audit_heads WHERE org_id=$1',[controls.orgId])).rows[0];expect(verifyChain(rows,head.head_hash)).toBe(true);
});

it('rejects a changed source revision and archives fresh content after refetch',async()=>{
 const request=await create(),inv=await flow.start(keeper,request.id,{expectedVersion:1},randomUUID()),oldReport=await reportFor(request.id);
 const original=(await admin.query("SELECT content FROM source_records WHERE org_id=$1 AND source_id='GATE-ISSUE-101'",[controls.orgId])).rows[0].content;
 try{
  await admin.query("UPDATE source_records SET content=content||'{\"updatedForInvestigation\":true}'::jsonb WHERE org_id=$1 AND source_id='GATE-ISSUE-101'",[controls.orgId]);
  const validation=await service.validateDecision(finance,request.id);
  expect(validation.status).toBe('CHANGED');expect(validation.reasons).toContain('EVIDENCE_CHANGED');
  expect((await service.get(finance,request.id)).version).toBe(1);
  await expect(flow.submit(keeper,request.id,{expectedVersion:1,runId:inv.run_id,report:oldReport},randomUUID())).rejects.toMatchObject({code:'STALE_SOURCE'});
  await flow.submit(keeper,request.id,{expectedVersion:1,runId:inv.run_id,report:await reportFor(request.id)},randomUUID());
  const revisions=(await admin.query('SELECT evidence FROM request_revisions WHERE request_id=$1 ORDER BY revision',[request.id])).rows;
  expect(revisions[0]!.evidence.items.find((i:any)=>i.sourceId==='GATE-ISSUE-101').content.updatedForInvestigation).toBeUndefined();
  expect(revisions[1]!.evidence.items.find((i:any)=>i.sourceId==='GATE-ISSUE-101').content.updatedForInvestigation).toBe(true);
 }finally{await admin.query("UPDATE source_records SET content=$2 WHERE org_id=$1 AND source_id='GATE-ISSUE-101'",[controls.orgId,original]);}
});

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
import type { Principal, Proposal } from '../src/contracts.js';
const port=57000+process.pid%1000;
const pg=new EmbeddedPostgres({databaseDir:`work/automatic-test-${randomUUID()}`,user:'automatic_test',password:'isolated_test_only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let admin:Pool,runtime:Pool,service:GateService,p:Principal,proposal:Proposal;
beforeAll(async()=>{
 await pg.initialise();await pg.start();await pg.createDatabase('automatic_tests');
 const connectionString=`postgresql://automatic_test:isolated_test_only@127.0.0.1:${port}/automatic_tests`;
 admin=new Pool({connectionString});await migrate(admin);const controls=await seedControls(admin);
 const restricted=randomUUID();await admin.query("INSERT INTO projects VALUES($1,$2,'Test restricted')",[restricted,controls.orgId]);
 await importEvidence(admin,controls.orgId,controls.projectId,'data/synthetic',JSON.parse(await readFile('data/synthetic/manifest.json','utf8')),restricted);
 const owner=(await admin.query("SELECT p.*,c.id AS credential_id FROM principals p JOIN credentials c ON c.principal_id=p.id WHERE p.org_id=$1 AND p.role='OPERATOR' ORDER BY p.name LIMIT 1",[controls.orgId])).rows[0];
 const agent=(await admin.query('SELECT id FROM agents WHERE org_id=$1 AND owner_id=$2',[controls.orgId,owner.id])).rows[0];
 const merchant=(await admin.query("SELECT id FROM merchants WHERE org_id=$1 AND status='ALLOWED'",[controls.orgId])).rows[0];
 p={id:owner.id,orgId:owner.org_id,credentialId:owner.credential_id,role:'OPERATOR',approvalLimitMinor:'0'};
 proposal={agentId:agent.id,projectId:controls.projectId,merchantId:merchant.id,amountMinor:'20000',currency:'USD',category:'diagnostics',purpose:'Test sandbox policy authorization',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}};
 runtime=new Pool({connectionString,options:'-c role=gate_runtime'});service=new GateService(runtime);
});
afterAll(async()=>{await runtime?.end();await admin?.end();await pg.stop();});
it('automatically captures one low-risk purchase while a simultaneous duplicate requires approval',async()=>{
 const key=randomUUID();
 const results=await Promise.all([service.create(p,proposal,key),service.create(p,proposal,randomUUID())]);
 expect(results.map(r=>r.workflowStatus).sort()).toEqual(['AUTHORIZED','AWAITING_CONSENT']);
 expect(results.find(r=>r.workflowStatus==='AWAITING_CONSENT')!.decision.reviewRequirements).toContainEqual({code:'DUPLICATE_BUSINESS_INTENT',resolution:'HUMAN_JUDGMENT'});
 const first=results.find(r=>r.workflowStatus==='AUTHORIZED')!;
 expect(await service.create(p,proposal,key)).toEqual(JSON.parse(JSON.stringify(results[0])));
 expect((await admin.query('SELECT count(*) FROM approvals')).rows[0].count).toBe('0');
 await new GateWorker(runtime).runOnce();
 expect(await service.get(p,first.id)).toMatchObject({workflowStatus:'COMPLETED',payment:{status:'SUCCEEDED'},decision:{requiresHumanConsent:false}});
});
it('requires consent above $1000 and denies above the agent cap',async()=>{
 const high=await service.create(p,{...proposal,amountMinor:'100001'},randomUUID());
 expect(high).toMatchObject({workflowStatus:'AWAITING_CONSENT',decision:{verdict:'REVIEW',requiresHumanConsent:true}});
 const denied=await service.create(p,{...proposal,amountMinor:'500001'},randomUUID());
 expect(denied.workflowStatus).toBe('REJECTED');
 expect((await admin.query('SELECT count(*) FROM payments')).rows[0].count).toBe('1');
});

it('dashboard approval authorizes an expensive purchase and replays without another payment',async()=>{
 const finance=(await admin.query("SELECT * FROM principals WHERE org_id=$1 AND role='FINANCE'",[p.orgId])).rows[0];
 const app=createApp(runtime,{paymentExecution:true,demoWorkspace:{orgId:p.orgId,principalId:finance.id},origins:['http://localhost:5173'],browserHosts:['localhost:8000']});
 try {
  const dashboard=(await app.inject({url:'/v1/demo/dashboard',headers:{host:'localhost:8000'}})).json().data;
  const row=dashboard.requests.find((r:any)=>r.proposal.amountMinor==='100001');
  const action=randomUUID(),body={choice:'approve',reason:'Review purchase over $1000',expectedVersion:row.version,snapshotHash:row.snapshotHash};
  const submit=()=>app.inject({method:'POST',url:`/v1/demo/transactions/${row.id}/review`,headers:{host:'localhost:8000',origin:'http://localhost:5173','idempotency-key':action},payload:body});
  const first=await submit();expect(first.statusCode).toBe(200);
  expect((await submit()).json().data.paymentId).toBe(first.json().data.paymentId);
  await new GateWorker(runtime).runOnce();
  expect(await service.get(p,row.id)).toMatchObject({workflowStatus:'COMPLETED',payment:{status:'SUCCEEDED'}});
 } finally {await app.close();}
});
it('revoked evidence cancels automatic authority before dispatch and releases its hold',async()=>{
 const request=await service.create(p,{...proposal,amountMinor:'20002'},randomUUID());
 expect(request.workflowStatus).toBe('AUTHORIZED');
 await admin.query("UPDATE source_records SET content=content || '{\"changed\":true}'::jsonb WHERE org_id=$1 AND source_id='GATE-ISSUE-101'",[p.orgId]);
 await new GateWorker(runtime).runOnce();
 expect(await service.get(p,request.id)).toMatchObject({workflowStatus:'CANCELLED',payment:{holdState:'RELEASED'}});
});

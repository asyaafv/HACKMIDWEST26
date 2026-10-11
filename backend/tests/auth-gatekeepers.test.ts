/** Isolated real PostgreSQL and SDK calls verify identity, browser controls, and scoped recovery. */
import { beforeAll,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Pool,type DB } from '../src/db.js';
import { migrate } from '../scripts/migrate.js';
import { seedControls } from '../scripts/seed.js';
import { provisionGatekeeper,provisionHumanLogin,revokeCredential } from '../src/identity.js';
import { authenticate } from '../src/auth.js';
import { GateService } from '../src/service.js';
import { GateWorker } from '../src/worker.js';
import { createApp } from '../src/app.js';
import { authRoutes } from '../src/routes/auth.js';
import { hashPassword,verifyPassword,httpAuthenticate } from '../src/sessions.js';
import { enforceHttpCapability } from '../src/capabilities.js';
import { runGatekeeperScenario,callGateTool } from '../scripts/gatekeeper-scenario.js';
import { listRequests } from '../src/mcp-context.js';
import type { Proposal } from '../src/contracts.js';
const port=58000+process.pid%1000;
const pg=new EmbeddedPostgres({databaseDir:`work/test-identity-${randomUUID()}`,user:'identity_test',password:'unit_test_only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let admin:DB,runtime:DB,service:GateService,controls:Awaited<ReturnType<typeof seedControls>>;
let a:Awaited<ReturnType<typeof provisionGatekeeper>>,b:typeof a,investigator:typeof a;
let app:ReturnType<typeof createApp>,browser:FastifyInstance,url:string;
let proposal:Proposal;
async function connect(token:string) {
 const client=new Client({name:'identity tests',version:'0.2.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));return client;
}
beforeAll(async()=>{
 await pg.initialise();await pg.start();await pg.createDatabase('identity_tests');
 const connectionString=`postgresql://identity_test:unit_test_only@127.0.0.1:${port}/identity_tests`;
 admin=new Pool({connectionString});await migrate(admin);runtime=new Pool({connectionString,options:'-c role=gate_runtime'});service=new GateService(runtime);
 controls=await seedControls(admin);
 a=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Gatekeeper A'});
 const projectId=randomUUID();await admin.query("INSERT INTO projects VALUES($1,$2,'Separate source project')",[projectId,controls.orgId]);
 await admin.query("INSERT INTO principal_projects VALUES($1,$2,$3)",[controls.orgId,controls.identities.FINANCE!.id,projectId]);
 await admin.query("INSERT INTO budgets(id,org_id,project_id,period_start,period_end,limit_minor) VALUES($1,$2,$3,now()-interval '1 day',now()+interval '1 day',1000000)",[randomUUID(),controls.orgId,projectId]);
 b=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId,name:'Gatekeeper B'});
 investigator=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Investigator',investigator:true});
 for(const [project,source] of [[controls.projectId,'SOURCE-A'],[projectId,'SOURCE-B']]) {
  const primary=randomUUID(),related=randomUUID();
  await admin.query("INSERT INTO source_records VALUES($1,$2,$3,'UNIT_TEST_ONLY','manifest','pm',$4,'unit.json','','hash',$5)",[primary,controls.orgId,project,source,{id:source}]);
  await admin.query("INSERT INTO source_records VALUES($1,$2,$3,'UNIT_TEST_ONLY','manifest','crm',$4,'unit.json','','hash',$5)",[related,controls.orgId,project,`${source}-TICKET`,{id:`${source}-TICKET`}]);
  await admin.query("INSERT INTO source_links VALUES($1,$2,$3,'/ticket')",[controls.orgId,primary,related]);
 }
 proposal={agentId:a.agentId,projectId:a.projectId,merchantId:controls.merchantId,amountMinor:'170000',currency:'USD',category:'diagnostics',purpose:'Identity test purchase',source:{domain:'pm',sourceId:'SOURCE-A'}};
 // Bind an ephemeral port before constructing the exact Host allowlist.
 app=createApp(runtime,{mcpHosts:[]});url=await app.listen({port:0,host:'127.0.0.1'});
 await app.close();app=createApp(runtime,{mcpHosts:[new URL(url).host]});await app.listen({port:Number(new URL(url).port),host:'127.0.0.1'});
 await provisionHumanLogin(admin,controls.orgId,controls.identities.FINANCE!.id,'finance-unit','unit-test-password');
 browser=Fastify();await browser.register(rateLimit,{max:60,timeWindow:'1 minute'});
 browser.setErrorHandler((e,_req,reply)=>reply.code((e as any).status??400).send({code:(e as any).code??'INVALID_INPUT'}));
 await browser.register(authRoutes,{db:runtime,origins:['https://gate.test'],hosts:['gate.test'],prefix:'/v1'});
 browser.post('/v1/guard',async req=>{const p=await httpAuthenticate(runtime,req,['https://gate.test'],['gate.test']);enforceHttpCapability(p,'POST','/v1/requests/x/consent');return {role:p.role};});
 await browser.ready();
});
afterAll(async()=>{await browser?.close();await app?.close();await runtime?.end();await admin?.end();await pg.stop();});
it('uses scrypt with independent salts and rejects wrong passwords',async()=>{
 const one=await hashPassword('unit-test-password'),two=await hashPassword('unit-test-password');expect(one).not.toBe(two);expect(await verifyPassword('unit-test-password',one)).toBe(true);expect(await verifyPassword('wrong',one)).toBe(false);
});
it('uses real scoped SDK identities, independent finance consent, and actual payment outcome',async()=>{
 const client=await connect(a.token);
 try {
  const tools=(await client.listTools()).tools;expect(tools.map(t=>t.name)).toEqual(['gate_list_investigations','gate_start_investigation','gate_submit_evidence','gate_fail_investigation','gate_catalog','gate_search_context','gate_get_context','gate_preview_spend','gate_request_spend','gate_list_requests','gate_get_request']);expect(tools.some(t=>t.name.includes('consent'))).toBe(false);
  await expect(runGatekeeperScenario(client,{proposal,permissionToRecord:false,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'RECORD_PERMISSION_REQUIRED'});
  const key=randomUUID(),result=await runGatekeeperScenario(client,{proposal,permissionToRecord:true,idempotencyKey:key});const id=(result.request as any).id;
  const repeat=await callGateTool(client,'gate_request_spend',{...proposal,idempotency_key:key}) as any;expect(repeat.id).toBe(id);
  const principal=await authenticate(runtime,`Bearer ${a.token}`);
  await expect(service.preview(principal,id,randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(service.consent(principal,id,{},randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});
  const finance=await authenticate(runtime,`Bearer ${controls.identities.FINANCE!.token}`),preview=await service.preview(finance,id,randomUUID());
  const consent=await service.consent(finance,id,{choice:'approve',previewId:preview.id,previewHash:preview.previewHash,expectedVersion:preview.expectedVersion,reason:'Independent test consent',reviewResolutions:preview.decision.reviewRequirements.map(r=>r.code)},randomUUID());
  await new GateWorker(runtime).runOnce();const payment=(await callGateTool(client,'gate_get_request',{request_id:id}) as any).payment;
  expect(payment).toMatchObject({status:'SUCCEEDED',holdState:'CAPTURED'});expect(payment.receipt).toBeTruthy();
 } finally {await client.close();}
});
it('isolates another principal/source and paginates without cross-agent exposure',async()=>{
 const client=await connect(b.token);
 try {
  expect((await client.callTool({name:'gate_get_context',arguments:{source_domain:'pm',source_id:'SOURCE-A'}})).isError).toBe(true);
  expect((await callGateTool(client,'gate_get_context',{source_domain:'pm',source_id:'SOURCE-B'}) as any).source.sourceId).toBe('SOURCE-B');
  const p={...proposal,agentId:b.agentId,projectId:b.projectId,source:{domain:'pm' as const,sourceId:'SOURCE-B'}};
  for(let i=0;i<3;i++) await callGateTool(client,'gate_request_spend',{...p,idempotency_key:randomUUID()});
  const principal=await authenticate(runtime,`Bearer ${b.token}`),first=await listRequests(runtime,principal,{limit:2});
  expect(first.items).toHaveLength(2);expect(first.partial).toBe(true);expect(first.items.every(r=>r.agent_id===b.agentId)).toBe(true);
  const next=await listRequests(runtime,principal,{limit:2,cursor:first.next_cursor!});expect(next.items).toHaveLength(1);
  await expect(listRequests(runtime,principal,{cursor:'invalid'})).rejects.toMatchObject({code:'INVALID_CURSOR'});
  await expect(listRequests(runtime,await authenticate(runtime,`Bearer ${a.token}`),{cursor:first.next_cursor!})).rejects.toMatchObject({code:'INVALID_CURSOR'});
  const humanOperator=await authenticate(runtime,`Bearer ${controls.identities.OPERATOR!.token}`);
  expect((await listRequests(runtime,humanOperator,{})).items).toHaveLength(0);
  const ownA=(await listRequests(runtime,await authenticate(runtime,`Bearer ${a.token}`),{})).items[0]!;
  expect((await client.callTool({name:'gate_get_request',arguments:{request_id:ownA.id}})).isError).toBe(true);
 } finally {await client.close();}
});
it('denies investigator submission and next call after credential revocation or expiry',async()=>{
 const client=await connect(investigator.token);
 try {
  const result=await client.callTool({name:'gate_request_spend',arguments:{...proposal,agentId:investigator.agentId,idempotency_key:randomUUID()}});expect(result.isError).toBe(true);
  const principal=await authenticate(runtime,`Bearer ${investigator.token}`);await expect(service.create(principal,{...proposal,agentId:investigator.agentId},randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});
  await revokeCredential(admin,controls.orgId,investigator.credentialId);await expect(client.callTool({name:'gate_catalog',arguments:{}})).rejects.toBeDefined();
  await admin.query("UPDATE credentials SET expires_at=now()-interval '1 second' WHERE id=$1",[investigator.credentialId]);await expect(authenticate(runtime,`Bearer ${investigator.token}`)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 } finally {await client.close();}
});
it('rejects absent bearer, wrong Host/Origin and unknown tools',async()=>{
 expect((await app.inject({method:'POST',url:'/mcp',headers:{host:new URL(url).host},payload:{}})).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url:'/mcp',headers:{host:'evil.test',authorization:`Bearer ${a.token}`},payload:{}})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:'/mcp',headers:{host:new URL(url).host,origin:'https://evil.test',authorization:`Bearer ${a.token}`},payload:{}})).statusCode).toBe(403);
 const client=await connect(a.token);try{expect((await client.callTool({name:'gate_consent_request',arguments:{}})).isError).toBe(true);}finally{await client.close();}
});
it('creates Secure HttpOnly sessions; enforces CSRF/Origin, logout, expiry and bearer separation',async()=>{
 const headers={host:'gate.test',origin:'https://gate.test'};
 const bad=await browser.inject({method:'POST',url:'/v1/auth/login',headers,payload:{username:'finance-unit',password:'wrong'}});expect(bad.statusCode).toBe(401);
 const login=await browser.inject({method:'POST',url:'/v1/auth/login',headers,payload:{username:'finance-unit',password:'unit-test-password'}});expect(login.statusCode).toBe(200);
 const cookie=String(login.headers['set-cookie']).split(';')[0]!,csrf=login.json().data.csrfToken;
 expect(login.headers['set-cookie']).toContain('Secure');expect(login.headers['set-cookie']).toContain('HttpOnly');expect(login.headers['set-cookie']).toContain('SameSite=Strict');
 expect((await browser.inject({url:'/v1/auth/me',headers:{host:'gate.test',cookie}})).json().data.role).toBe('FINANCE');
 expect((await browser.inject({method:'POST',url:'/v1/guard',headers:{...headers,cookie}})).statusCode).toBe(403);
 expect((await browser.inject({method:'POST',url:'/v1/guard',headers:{...headers,cookie,'x-csrf-token':csrf}})).statusCode).toBe(200);
 expect((await browser.inject({method:'POST',url:'/v1/guard',headers:{...headers,cookie,origin:'https://evil.test','x-csrf-token':csrf}})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:'/mcp',headers:{host:new URL(url).host,cookie},payload:{}})).statusCode).toBe(401);
 expect((await browser.inject({method:'POST',url:'/v1/auth/logout',headers:{...headers,cookie,'x-csrf-token':csrf}})).statusCode).toBe(200);
 expect((await browser.inject({url:'/v1/auth/me',headers:{host:'gate.test',cookie}})).statusCode).toBe(401);
 const again=await browser.inject({method:'POST',url:'/v1/auth/login',headers,payload:{username:'finance-unit',password:'unit-test-password'}});
 await admin.query("UPDATE browser_sessions SET expires_at=now()-interval '1 second'");
 expect((await browser.inject({url:'/v1/auth/me',headers:{host:'gate.test',cookie:String(again.headers['set-cookie']).split(';')[0]!}})).statusCode).toBe(401);
});
it('recovers a lost submission response using the original key and retained payment hold',async()=>{
 const client=await connect(a.token);
 try {
  let dropped=false;const original=client.callTool.bind(client);
  client.callTool=(async(...args:Parameters<Client['callTool']>)=>{
   const result=await original(...args);
   if(args[0].name==='gate_request_spend'&&!dropped){dropped=true;throw new Error('Unit-only dropped response after real server commit');}
   return result;
  }) as Client['callTool'];
  const p={...proposal,amountMinor:'170001',purpose:'Separate lost-response test purchase'},key=randomUUID();
  const result=await runGatekeeperScenario(client,{proposal:p,permissionToRecord:true,idempotencyKey:key});const id=(result.request as any).id;
  expect((await admin.query('SELECT count(*) FROM idempotency_records WHERE org_id=$1 AND principal_id=$2 AND key=$3',[controls.orgId,a.principalId,key])).rows[0].count).toBe('1');
  const finance=await authenticate(runtime,`Bearer ${controls.identities.FINANCE!.token}`),preview=await service.preview(finance,id,randomUUID());
  const consent=await service.consent(finance,id,{choice:'approve',previewId:preview.id,previewHash:preview.previewHash,expectedVersion:preview.expectedVersion,reason:'Independent lost-response consent',reviewResolutions:preview.decision.reviewRequirements.map(r=>r.code)},randomUUID());
  const administrator=await authenticate(runtime,`Bearer ${controls.identities.ADMIN!.token}`);
  await service.setPaymentFault(administrator,consent.paymentId!,'TIMEOUT_AFTER_COMMIT',randomUUID(),true);
  await new GateWorker(runtime).runOnce();
  expect((await callGateTool(client,'gate_get_request',{request_id:id}) as any).payment).toMatchObject({status:'UNKNOWN',holdState:'HELD'});
  await service.reconcilePayment(finance,consent.paymentId!,randomUUID());
  expect((await callGateTool(client,'gate_get_request',{request_id:id}) as any).payment).toMatchObject({status:'SUCCEEDED',holdState:'CAPTURED'});
  expect((await admin.query('SELECT count(*) FROM simulator_transactions WHERE payment_id=$1',[consent.paymentId])).rows[0].count).toBe('1');
 } finally {await client.close();}
});
it('denies an expired unrevoked agent credential',async()=>{
 const expired=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Expired gatekeeper'});
 await admin.query("UPDATE credentials SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.credentialId]);
 await expect(authenticate(runtime,`Bearer ${expired.token}`)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
});
it('treats a shared connection as one service identity and cannot accept chat identity overrides',async()=>{
 const first=await authenticate(runtime,`Bearer ${a.token}`),second=await authenticate(runtime,`Bearer ${a.token}`);expect(first.id).toBe(second.id);
 const client=await connect(a.token);try{expect((await client.callTool({name:'gate_request_spend',arguments:{...proposal,idempotency_key:randomUUID(),human_user_id:b.principalId}})).isError).toBe(true);}finally{await client.close();}
});

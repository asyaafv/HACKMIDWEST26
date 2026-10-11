/** Isolated PostgreSQL/MCP/browser acceptance verifies anonymous demo reviews without financial mutations. */
import { beforeAll,beforeEach, afterAll, it, expect } from 'vitest';
import { chromium, type Browser, expect as browserExpect } from '@playwright/test';
import EmbeddedPostgres from 'embedded-postgres';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Pool, type DB } from '../src/db.js';
import { migrate } from '../scripts/migrate.js';
import { prepareDemo, seedControls } from '../scripts/seed.js';
import { createApp } from '../src/app.js';
import { authenticate } from '../src/auth.js';
import { GateService } from '../src/service.js';
import { Investigations } from '../src/investigations.js';
import { provisionGatekeeper,provisionHumanLogin } from '../src/identity.js';
import { callGateTool } from '../scripts/gatekeeper-scenario.js';
const pg = new EmbeddedPostgres({ databaseDir: `work/live-test-${randomUUID()}`, user: 'live_test', password: 'isolated_only', port: 60000 + process.pid % 500, persistent: false, postgresFlags: ['-h','127.0.0.1'], onLog: () => {}, onError: () => {} });
let admin: DB, runtime: DB, browser: Browser, app: ReturnType<typeof createApp>, vite: ChildProcess;
let controls: Awaited<ReturnType<typeof seedControls>>, base: string, frontend: string;
async function freePort() {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port; await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
beforeAll(async () => {
  await pg.initialise(); await pg.start(); await pg.createDatabase('live_tests');
  const connectionString = `postgresql://live_test:isolated_only@127.0.0.1:${60000 + process.pid % 500}/live_tests`;
  admin = new Pool({ connectionString }); await migrate(admin); runtime = new Pool({ connectionString, options: '-c role=gate_runtime' });
  controls = await seedControls(admin); await prepareDemo(admin);
  const apiPort = await freePort(), uiPort = await freePort(); base = `http://127.0.0.1:${apiPort}`; frontend = `http://127.0.0.1:${uiPort}`;
  app = createApp(runtime, { demoWorkspace:{orgId:controls.orgId,principalId:controls.identities.FINANCE!.id}, origins: [frontend], browserHosts: [`127.0.0.1:${apiPort}`], mcpHosts: [`127.0.0.1:${apiPort}`] });
  await app.listen({ host: '127.0.0.1', port: apiPort });
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(uiPort),'--strictPort'], { cwd: '../frontend', env: { ...process.env, GATE_API_URL: base }, stdio: 'ignore' });
  for (let tries = 0; ; tries++) {
    try { if ((await fetch(`${frontend}/live`)).ok) break; } catch { /* Wait for the owned Vite process. */ }
    if (tries >= 100 || vite.exitCode !== null) throw new Error('Private frontend failed to start.'); await sleep(100);
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
});
beforeEach(async()=>{
 // Each scenario gets its own real rate limiter; preceding tests must not consume its IP quota.
 await app.close();const host=new URL(base).host;
 app=createApp(runtime,{demoWorkspace:{orgId:controls.orgId,principalId:controls.identities.FINANCE!.id},origins:[frontend],browserHosts:[host],mcpHosts:[host]});
 await app.listen({host:'127.0.0.1',port:Number(new URL(base).port)});
});
afterAll(async () => { await browser?.close(); if (vite && vite.exitCode === null) { const stopped = new Promise(resolve => vite.once('exit', resolve)); vite.kill('SIGTERM'); await stopped; } await app?.close(); await runtime?.end(); await admin?.end(); await pg.stop(); });
it('signs in through the existing settings UI and uses the real scoped dashboard with an HttpOnly session',async()=>{
 await provisionHumanLogin(admin,controls.orgId,controls.identities.OPERATOR!.id,'ui-operator','isolated-ui-password');
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.goto(`${frontend}/settings`);
 if(await page.getByRole('button',{name:'Skip intro'}).isVisible())await page.getByRole('button',{name:'Skip intro'}).click();
 await page.getByLabel('Username',{exact:true}).fill('ui-operator');await page.getByLabel('Password',{exact:true}).fill('isolated-ui-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await browserExpect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
 const cookies=await page.context().cookies();expect(cookies.find(c=>c.name==='__Host-gate_session')).toMatchObject({httpOnly:true,secure:true,sameSite:'Strict'});
 const identity=await page.evaluate(async()=> (await (await fetch('/v1/auth/me')).json()).data);expect(identity.role).toBe('OPERATOR');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await browserExpect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await page.close();
});
it('authenticated transaction annotations enforce finance access and preserve financial records',async()=>{
 const service=new GateService(runtime),operator=await authenticate(runtime,`Bearer ${controls.identities.OPERATOR!.token}`),finance=await authenticate(runtime,`Bearer ${controls.identities.FINANCE!.token}`);
 const request=await service.create(operator,{agentId:controls.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'170001',currency:'USD',category:'diagnostics',purpose:'Authenticated annotation test',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}},randomUUID());
 await new Investigations(runtime,service).localRun(finance,request.id,{expectedVersion:request.version},randomUUID());
 const record=(await service.dashboard(finance)).requests.find(r=>r.id===request.id)!,body={choice:'reject',reason:'Independent annotation',expectedVersion:record.version,snapshotHash:record.snapshotHash};
 const counts=async()=>Promise.all(['payments','jobs','simulator_transactions','budget_entries','approvals','authorizations'].map(async table=>(await admin.query(`SELECT count(*) FROM ${table}`)).rows[0].count));const before=await counts();
 expect((await app.inject({method:'POST',url:`/v1/requests/${request.id}/transaction/review`,headers:{authorization:`Bearer ${controls.identities.OPERATOR!.token}`,'idempotency-key':randomUUID()},payload:body})).statusCode).toBe(403);
 const headers={authorization:`Bearer ${controls.identities.FINANCE!.token}`,'idempotency-key':randomUUID()};
 expect((await app.inject({method:'POST',url:`/v1/requests/${request.id}/transaction/review`,headers,payload:body})).statusCode).toBe(200);
 expect((await app.inject({method:'POST',url:`/v1/requests/${request.id}/transaction/review`,headers,payload:body})).statusCode).toBe(200);
 expect(await counts()).toEqual(before);expect((await service.get(finance,request.id)).version).toBe(record.version);
 expect((await admin.query('SELECT packet->\'details\'->>\'actorMode\' AS mode FROM audit_events WHERE packet->>\'resourceId\'=$1 AND packet->>\'event\'=\'transaction.rejected\'',[request.id])).rows[0].mode).toBe('authenticated_human');
});
it('authenticated pending rejection is finance-only and creates no payment or authorization records',async()=>{
 const service=new GateService(runtime),operator=await authenticate(runtime,`Bearer ${controls.identities.OPERATOR!.token}`),financeToken=controls.identities.FINANCE!.token;
 const request=await service.create(operator,{agentId:controls.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'170001',currency:'USD',category:'diagnostics',purpose:'Authenticated pending rejection test',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}},randomUUID());
 const record=(await service.dashboard(await authenticate(runtime,`Bearer ${financeToken}`))).requests.find(r=>r.id===request.id)!;
 const body={choice:'reject',reason:'Required evidence remains unresolved.',expectedVersion:record.version,snapshotHash:record.snapshotHash};
 const counts=async()=>Promise.all(['payments','authorizations','jobs','simulator_transactions','budget_entries','approvals'].map(async table=>(await admin.query(`SELECT count(*) FROM ${table} WHERE ${['jobs','simulator_transactions','budget_entries'].includes(table)?'payment_id IN (SELECT id FROM payments WHERE request_id=$1)':'request_id=$1'}`,[request.id])).rows[0].count));
 const before=await counts(),key=randomUUID();
 expect((await app.inject({method:'POST',url:`/v1/requests/${request.id}/reject`,headers:{'idempotency-key':randomUUID()},payload:body})).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url:`/v1/requests/${request.id}/reject`,headers:{authorization:`Bearer ${controls.identities.OPERATOR!.token}`,'idempotency-key':randomUUID()},payload:body})).statusCode).toBe(403);
 const headers={authorization:`Bearer ${financeToken}`,'idempotency-key':key};
 const response=await app.inject({method:'POST',url:`/v1/requests/${request.id}/reject`,headers,payload:body});
 expect(response.statusCode).toBe(200);expect(response.json().data.workflowStatus).toBe('REJECTED');
 expect((await app.inject({method:'POST',url:`/v1/requests/${request.id}/reject`,headers,payload:body})).statusCode).toBe(200);
 expect(await counts()).toEqual(before);
 expect((await service.get(await authenticate(runtime,`Bearer ${financeToken}`),request.id)).workflowStatus).toBe('REJECTED');
});
it('authenticated approval endpoint records human review without creating payment authority or reserving budget',async()=>{
 const service=new GateService(runtime),operator=await authenticate(runtime,`Bearer ${controls.identities.OPERATOR!.token}`),finance=await authenticate(runtime,`Bearer ${controls.identities.FINANCE!.token}`);
 const request=await service.create(operator,{agentId:controls.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'170001',currency:'USD',category:'diagnostics',purpose:'Authenticated review-only approval test',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}},randomUUID());
 const reviewed=await new Investigations(runtime,service).localRun(finance,request.id,{expectedVersion:request.version},randomUUID());
 expect(reviewed.workflowStatus).toBe('AWAITING_CONSENT');expect(reviewed.decision.executionAllowed).toBe(true);
 const host=new URL(base).host,headers={host,authorization:`Bearer ${controls.identities.FINANCE!.token}`};
 const counts=async()=>Promise.all(['payments','authorizations','jobs','simulator_transactions','budget_entries'].map(async table=>(await admin.query(`SELECT count(*) FROM ${table} WHERE ${['jobs','simulator_transactions','budget_entries'].includes(table)?'payment_id IN (SELECT id FROM payments WHERE request_id=$1)':'request_id=$1'}`,[request.id])).rows[0].count));
 const before=await counts(),previewKey=randomUUID();
 const previewResponse=await app.inject({method:'POST',url:`/v1/requests/${request.id}/preview`,headers:{...headers,'idempotency-key':previewKey},payload:{}});
 expect(previewResponse.statusCode).toBe(200);const preview=previewResponse.json().data;
 const response=await app.inject({method:'POST',url:`/v1/requests/${request.id}/review`,headers:{...headers,'idempotency-key':randomUUID()},payload:{choice:'approve',reason:'Independent finance review complete.',previewId:preview.id,previewHash:preview.previewHash,expectedVersion:preview.expectedVersion,reviewResolutions:preview.decision.reviewRequirements.filter((item:any)=>item.resolution==='HUMAN_JUDGMENT').map((item:any)=>item.code)}});
 expect(response.statusCode,JSON.stringify(response.json())).toBe(200);expect(response.json().data).toMatchObject({workflowStatus:'AUTHORIZED',paymentExecution:false});
 expect(await counts()).toEqual(before);
 const row=(await service.dashboard(finance)).requests.find(item=>item.id===request.id)!;expect(row.workflowStatus).toBe('AUTHORIZED');
 expect((await admin.query('SELECT count(*) FROM approvals WHERE request_id=$1 AND choice=\'approve\'',[request.id])).rows[0].count).toBe('1');
});
it('authenticated finance records a review without executing payment and safely retries a lost response', async () => {
 const page=await browser.newPage();page.setDefaultTimeout(10000);
 await provisionHumanLogin(admin,controls.orgId,controls.identities.FINANCE!.id,'ui-finance-reviewer','isolated-finance-password');
 const service=new GateService(runtime),finance=await authenticate(runtime,`Bearer ${controls.identities.FINANCE!.token}`);
 const gatekeeper=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Integration Gatekeeper'});
 const client=new Client({name:'transaction dashboard acceptance',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${gatekeeper.token}`}}}));
 try {
  const request=await callGateTool(client,'gate_request_spend',{agentId:gatekeeper.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'170001',currency:'USD',category:'diagnostics',purpose:'Automatically discovered MCP transaction',source:{domain:'pm',sourceId:'GATE-ISSUE-101'},idempotency_key:randomUUID()}) as {id:string};
  const latest=await service.get(finance,request.id);
  const evaluated=await new Investigations(runtime,service).localRun(finance,request.id,{expectedVersion:latest.version},randomUUID());
  expect(evaluated.workflowStatus).toBe('AWAITING_CONSENT');
  const financialCounts=async()=>Promise.all(['payments','authorizations','jobs','simulator_transactions','budget_entries'].map(async table=>(await admin.query(`SELECT count(*) FROM ${table} WHERE ${['jobs','simulator_transactions','budget_entries'].includes(table)?'payment_id IN (SELECT id FROM payments WHERE request_id=$1)':'request_id=$1'}`,[request.id])).rows[0].count));
  const before=await financialCounts(),budgetBefore=(await admin.query('SELECT reserved_minor,spent_minor FROM budgets WHERE project_id=$1',[controls.projectId])).rows[0];
  await page.goto(`${frontend}/settings`);if(await page.getByRole('button',{name:'Skip intro'}).isVisible())await page.getByRole('button',{name:'Skip intro'}).click();
  await page.getByLabel('Username',{exact:true}).fill('ui-finance-reviewer');await page.getByLabel('Password',{exact:true}).fill('isolated-finance-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await browserExpect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Transactions',exact:true}).click();
  const row=page.locator('tbody tr').filter({hasText:'Automatically discovered MCP transaction'});await row.getByRole('button').click();
  const panel=page.locator('.detail-panel');await browserExpect(panel).toBeVisible();
  await browserExpect(panel.getByText('Automatically discovered MCP transaction',{exact:true})).toBeVisible();
  await page.getByLabel('Decision reason').fill('Reviewed enterprise evidence and policy findings.');
  await browserExpect(panel.getByRole('button',{name:'Approve purchase',exact:true})).toBeEnabled();
  await page.route(`**/v1/requests/${request.id}/review`,async route=>{await route.fetch();await route.abort('failed');await page.unroute(`**/v1/requests/${request.id}/review`);});
  await panel.getByRole('button',{name:'Approve purchase',exact:true}).click();await browserExpect(page.getByRole('alert').first()).toContainText('Response lost');
  await panel.getByRole('button',{name:'Approve purchase',exact:true}).click();
  await browserExpect(page.locator('.success-toast')).toContainText('Finance approval recorded. No payment was executed.');
  await browserExpect(panel.getByRole('button',{name:'Approve purchase',exact:true})).toHaveCount(0);
  expect(await financialCounts()).toEqual(before);
  expect((await admin.query('SELECT reserved_minor,spent_minor FROM budgets WHERE project_id=$1',[controls.projectId])).rows[0]).toEqual(budgetBefore);
  expect((await admin.query('SELECT count(*) FROM approvals WHERE request_id=$1 AND choice=\'approve\'',[request.id])).rows[0].count).toBe('1');
  await browserExpect(panel.getByText('APPROVED',{exact:true}).first()).toBeVisible();
  await browserExpect(panel.getByText('No payment created',{exact:true})).toBeVisible();
 }finally{await client.close();await page.close();}
});
it('reviews existing payments without financial mutations and rejects stale, racing, and foreign-origin actions',async()=>{
 const service=new GateService(runtime),operator=await authenticate(runtime,`Bearer ${controls.identities.OPERATOR!.token}`),finance=await authenticate(runtime,`Bearer ${controls.identities.FINANCE!.token}`);
 const created=await service.create(operator,{agentId:controls.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'170001',currency:'USD',category:'diagnostics',purpose:'Previously stored payment',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}},randomUUID());
 const preview=await service.preview(finance,created.id,randomUUID());
 await service.consent(finance,created.id,{choice:'approve',previewId:preview.id,previewHash:preview.previewHash,expectedVersion:preview.expectedVersion,reason:'Isolated historical payment setup',reviewResolutions:preview.decision.reviewRequirements.filter((r:any)=>r.resolution==='HUMAN_JUDGMENT').map((r:any)=>r.code)},randomUUID());
 const before=(await admin.query('SELECT row_to_json(p) AS payment FROM payments p WHERE request_id=$1',[created.id])).rows[0].payment;
 const balances=(await admin.query('SELECT reserved_minor,spent_minor FROM budgets WHERE project_id=$1',[controls.projectId])).rows[0];
 const host=new URL(base).host;
 const headers={host,origin:frontend,'idempotency-key':randomUUID()};
 const dashboard=(await app.inject({url:'/v1/demo/dashboard',headers:{host}})).json().data;
 const record=dashboard.requests.find((r:any)=>r.id===created.id);expect(record.payment).not.toBeNull();
 const body={choice:'reject',reason:'Post-transaction enterprise review',expectedVersion:record.version,snapshotHash:record.snapshotHash};
 expect((await app.inject({method:'POST',url:`/v1/demo/transactions/${created.id}/review`,headers:{...headers,origin:'https://foreign.example'},payload:body})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:`/v1/demo/transactions/${created.id}/review`,headers,payload:{...body,snapshotHash:'0'.repeat(64)}})).statusCode).toBe(409);
 const outcomes=await Promise.all(['approve','reject'].map(choice=>app.inject({method:'POST',url:`/v1/demo/transactions/${created.id}/review`,headers:{...headers,'idempotency-key':randomUUID()},payload:{...body,choice}})));
 expect(outcomes.map(r=>r.statusCode).sort()).toEqual([200,409]);
 expect((await admin.query('SELECT row_to_json(p) AS payment FROM payments p WHERE request_id=$1',[created.id])).rows[0].payment).toEqual(before);
 expect((await admin.query('SELECT reserved_minor,spent_minor FROM budgets WHERE project_id=$1',[controls.projectId])).rows[0]).toEqual(balances);
 expect((await app.inject({method:'POST',url:`/v1/demo/transactions/${created.id}/review`,headers:{host,'idempotency-key':randomUUID()},payload:body})).statusCode).toBe(403);
 expect((await app.inject({url:'/v1/demo/dashboard',headers:{host:'foreign.example'}})).statusCode).toBe(403);
 await admin.query('DELETE FROM principal_projects WHERE org_id=$1 AND principal_id=$2 AND project_id=$3',[controls.orgId,finance.id,controls.projectId]);
 try{expect((await app.inject({method:'POST',url:`/v1/demo/transactions/${created.id}/review`,headers:{...headers,'idempotency-key':randomUUID()},payload:body})).statusCode).toBe(404);}
 finally{await admin.query('INSERT INTO principal_projects VALUES($1,$2,$3)',[controls.orgId,finance.id,controls.projectId]);}
 expect((await app.inject({url:'/v1/dashboard',headers:{host}})).statusCode).toBe(401);
 expect((await app.inject({url:'/dev-console',headers:{host}})).statusCode).toBe(404);
 const disabled=createApp(runtime);try{expect((await disabled.inject({url:'/v1/demo/dashboard'})).statusCode).toBe(404);}finally{await disabled.close();}
});
it('Transactions can save a sandbox request after a lost response without creating payment records',async()=>{
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.goto(`${frontend}/transactions`);
 if(await page.getByRole('button',{name:'Skip intro'}).isVisible())await page.getByRole('button',{name:'Skip intro'}).click();
 await browserExpect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
 await browserExpect(page.getByRole('button',{name:'Create Gatekeeper',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'New sandbox request',exact:true}).click();
 await page.getByLabel('Purchasing agent',{exact:true}).selectOption(controls.agentId);
 await page.getByLabel('Merchant',{exact:true}).selectOption(controls.merchantId);
 await page.getByLabel('Amount (USD)',{exact:true}).fill('1742.35');
 await page.getByLabel('Spend category',{exact:true}).selectOption('incident_response');
 await page.getByLabel('Business purpose',{exact:true}).fill('Simulated agent purchase from Gatekeepers');
 await page.getByLabel('Find supporting evidence').fill('GATE-ISSUE-101');await page.getByRole('button',{name:'Search sources'}).click();
 await browserExpect(page.getByLabel('Supporting source').locator('option')).toHaveCount(2);
 await page.getByLabel('Supporting source').selectOption('pm:GATE-ISSUE-101');
 const before=(await admin.query('SELECT (SELECT count(*) FROM payments) AS payments,(SELECT count(*) FROM jobs) AS jobs,(SELECT count(*) FROM budget_entries) AS entries')).rows[0];
 await page.getByRole('button',{name:'Preview policy'}).click();
 await browserExpect(page.getByRole('heading',{name:'Gate policy preview'})).toBeVisible();
 expect((await admin.query("SELECT count(*) FROM requests WHERE proposal->>'purpose'='Simulated agent purchase from Gatekeepers'")).rows[0].count).toBe('0');
 await page.route('**/v1/demo/purchases',async route=>{await route.fetch();await route.abort('failed');await page.unroute('**/v1/demo/purchases');});
 await page.getByRole('dialog',{name:'Simulate purchase',exact:true}).getByRole('button',{name:'Record simulated request',exact:true}).click();
 await browserExpect(page.getByRole('alert').first()).toContainText('Response lost');
 await page.getByRole('dialog',{name:'Simulate purchase',exact:true}).getByRole('button',{name:'Record simulated request',exact:true}).click();
 await browserExpect(page.getByRole('dialog',{name:'Simulate purchase',exact:true})).toHaveCount(0);
 await browserExpect(page.locator('.detail-panel').getByText('Simulated agent purchase from Gatekeepers',{exact:true})).toBeVisible();
 await browserExpect(page.getByText('Sandbox request',{exact:true}).first()).toBeVisible();
 await page.locator('.transaction-more > summary').click();
 await browserExpect(page.getByText('Waiting for Gatekeeper',{exact:true}).first()).toBeVisible();
 await browserExpect(page.getByRole('button',{name:'Approve purchase',exact:true})).toHaveCount(0);
 await browserExpect(page.getByRole('button',{name:'Reject purchase',exact:true})).toHaveCount(0);
 await page.route('**/v1/demo/transactions/*/investigation',async route=>{await route.fetch();await route.abort('failed');await page.unroute('**/v1/demo/transactions/*/investigation');});
 await page.getByRole('button',{name:'Run local investigation',exact:true}).click();
 await browserExpect(page.getByRole('alert').first()).toContainText('Response lost');
 await page.getByRole('button',{name:/Run local investigation|Recheck demo evidence/}).click();
 await browserExpect(page.getByText('Policy evaluated',{exact:true}).first()).toBeVisible();
 await browserExpect(page.getByRole('button',{name:'Approve purchase',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Validate decision',exact:true}).click();
 await browserExpect(page.getByRole('heading',{name:'Saved decision matches current backend checks',exact:true})).toBeVisible();
 await page.getByText('Backend risk algorithm',{exact:true}).click();
 await browserExpect(page.getByText('Duplicate business intent: 20 points',{exact:true})).toBeVisible();
 if(process.env.GATE_UI_CAPTURE){await page.locator('.detail-panel').evaluate(node=>{node.scrollTop=0;});await page.locator('.detail-panel').screenshot({path:process.env.GATE_UI_CAPTURE});}
 await page.getByText('Evaluation history (2)',{exact:true}).click();
 await browserExpect(page.getByText('Version 2: REVIEW · 20 risk points',{exact:true})).toBeVisible();
 const rows=(await admin.query("SELECT * FROM requests WHERE proposal->>'purpose'='Simulated agent purchase from Gatekeepers'")).rows;
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({origin:'SIMULATED_PURCHASE',amount_minor:'174235',version:2});
 expect(rows[0].proposal.category).toBe('incident_response');
 expect(rows[0].evidence.items.length).toBeGreaterThan(0);expect(rows[0].decision.rules.length).toBeGreaterThan(0);
 expect((await admin.query('SELECT (SELECT count(*) FROM payments) AS payments,(SELECT count(*) FROM jobs) AS jobs,(SELECT count(*) FROM budget_entries) AS entries')).rows[0]).toEqual(before);
 const host=new URL(base).host;
 expect((await app.inject({method:'POST',url:'/v1/demo/purchases',headers:{host,origin:frontend,'idempotency-key':randomUUID()},payload:{...rows[0].proposal,projectId:randomUUID()}})).statusCode).toBe(404);
 expect((await app.inject({method:'POST',url:'/v1/demo/purchases',headers:{host,origin:frontend,'idempotency-key':randomUUID()},payload:{...rows[0].proposal,amountMinor:'1.5'}})).statusCode).toBe(400);
 await page.goto(`${frontend}/transactions`);
 if(await page.getByRole('button',{name:'Skip intro'}).isVisible())await page.getByRole('button',{name:'Skip intro'}).click();
 await page.getByRole('button',{name:'New sandbox request',exact:true}).click();
 await page.getByLabel('Purchasing agent',{exact:true}).selectOption(controls.agentId);
 await page.getByLabel('Merchant',{exact:true}).selectOption(controls.merchantId);
 await page.getByLabel('Amount (USD)',{exact:true}).fill('1742.35'); // Duplicate detection requires the same exact amount.
 await page.getByLabel('Spend category',{exact:true}).selectOption('incident_response');
 await page.getByLabel('Business purpose',{exact:true}).fill('Simulated agent purchase from Gatekeepers');
 await page.getByLabel('Find supporting evidence').fill('GATE-ISSUE-101');
 await page.getByRole('button',{name:'Search sources'}).click();
 await page.getByLabel('Supporting source').selectOption('pm:GATE-ISSUE-101');
 await page.getByRole('button',{name:'Preview policy'}).click();
 await browserExpect(page.getByText('Review: DUPLICATE BUSINESS INTENT')).toBeVisible();
 expect((await admin.query("SELECT count(*) FROM requests WHERE origin='SIMULATED_PURCHASE'")).rows[0].count).toBe('1');
 await page.getByRole('button',{name:'Record simulated request',exact:true}).click();
 await browserExpect(page.getByRole('dialog',{name:'Simulate purchase',exact:true})).toHaveCount(0);
 expect((await admin.query("SELECT count(*) FROM requests WHERE origin='SIMULATED_PURCHASE'")).rows[0].count).toBe('2');
 const validation=(await app.inject({url:`/v1/demo/transactions/${rows[0].id}/validation`,headers:{host}})).json().data;
 expect(validation.status).toBe('CHANGED');expect(validation.reasons).toContain('POLICY_FINDINGS_CHANGED');
 expect(validation.decision.factors).toContainEqual({code:'DUPLICATE_INTENT',points:20});
 await page.close();
});

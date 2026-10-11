/** Isolated PostgreSQL/MCP/browser acceptance verifies anonymous demo reviews without financial mutations. */
import { beforeAll, afterAll, it, expect } from 'vitest';
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
import { provisionGatekeeper } from '../src/identity.js';
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
afterAll(async () => { await browser?.close(); if (vite && vite.exitCode === null) { const stopped = new Promise(resolve => vite.once('exit', resolve)); vite.kill('SIGTERM'); await stopped; } await app?.close(); await runtime?.end(); await admin?.end(); await pg.stop(); });
it('opens without login, polls actual MCP records, and replays a lost review response once', async () => {
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.goto(frontend);
 if(await page.getByRole('button',{name:'Skip intro'}).isVisible())await page.getByRole('button',{name:'Skip intro'}).click();
 await browserExpect(page.getByRole('heading',{name:'Workspace overview'})).toBeVisible();
 await browserExpect(page.getByLabel('Local access token')).toHaveCount(0);
 const gatekeeper=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Integration Gatekeeper'});
 const client=new Client({name:'transaction dashboard acceptance',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${gatekeeper.token}`}}}));
 try {
  const request=await callGateTool(client,'gate_request_spend',{agentId:gatekeeper.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'170001',currency:'USD',category:'diagnostics',purpose:'Automatically discovered MCP transaction',source:{domain:'pm',sourceId:'GATE-ISSUE-101'},idempotency_key:randomUUID()}) as {id:string};
  await page.getByRole('button',{name:new RegExp(`Open ${request.id}`)}).click();
  await page.getByRole('button',{name:'Run local investigation',exact:true}).click();
  await browserExpect(page.getByText('Policy evaluated',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Approve transaction',exact:true}).click();await page.getByLabel('Decision reason').fill('Reviewed enterprise context');
  await page.route('**/v1/demo/transactions/*/review',async route=>{await route.fetch();await route.abort('failed');await page.unroute('**/v1/demo/transactions/*/review');});
  await page.getByRole('button',{name:'Record approval'}).click();await browserExpect(page.getByRole('alert').first()).toContainText('Response lost');
  await page.getByRole('button',{name:'Record approval'}).click();await browserExpect(page.locator('dialog')).toHaveCount(0);
  expect((await admin.query('SELECT count(*) FROM transaction_reviews WHERE request_id=$1',[request.id])).rows[0].count).toBe('1');
  expect((await admin.query("SELECT count(*) FROM audit_events WHERE packet->>'event'='transaction.approved'")).rows[0].count).toBe('1');
  for(const table of ['payments','jobs','simulator_transactions','budget_entries'])expect((await admin.query(`SELECT count(*) FROM ${table}`)).rows[0].count).toBe('0');
  await page.reload();if(await page.getByRole('button',{name:'Skip intro'}).isVisible())await page.getByRole('button',{name:'Skip intro'}).click();
  await browserExpect(page.getByRole('heading',{name:'Authorization queue'})).toBeVisible();
  await browserExpect(page.getByText('Reviewed enterprise context',{exact:true})).toBeVisible();
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
it('Gatekeepers simulation button saves one evaluated proposal after a lost response and creates no payment',async()=>{
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.goto(`${frontend}/gatekeepers`);
 if(await page.getByRole('button',{name:'Skip intro'}).isVisible())await page.getByRole('button',{name:'Skip intro'}).click();
 await browserExpect(page.getByRole('heading',{name:'Gatekeepers',exact:true})).toBeVisible();
 await browserExpect(page.getByRole('button',{name:'Create Gatekeeper',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Simulate purchase',exact:true}).click();
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
 await browserExpect(page.getByText('Simulated agent purchase from Gatekeepers',{exact:true})).toBeVisible();
 await browserExpect(page.getByText('Simulated purchase proposal · imported synthetic context. Payments use the local sandbox provider.',{exact:true})).toBeVisible();
 await browserExpect(page.getByText('Waiting for Gatekeeper',{exact:true}).first()).toBeVisible();
 await browserExpect(page.getByRole('button',{name:'Approve transaction',exact:true})).toHaveCount(0);
 await page.route('**/v1/demo/transactions/*/investigation',async route=>{await route.fetch();await route.abort('failed');await page.unroute('**/v1/demo/transactions/*/investigation');});
 await page.getByRole('button',{name:'Run local investigation',exact:true}).click();
 await browserExpect(page.getByRole('alert').first()).toContainText('Response lost');
 await page.getByRole('button',{name:/Run local investigation|Recheck demo evidence/}).click();
 await browserExpect(page.getByText('Policy evaluated',{exact:true}).first()).toBeVisible();
 await browserExpect(page.getByRole('button',{name:'Approve transaction',exact:true})).toBeEnabled();
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
 await page.goto(`${frontend}/gatekeepers`);
 await page.getByRole('button',{name:'Simulate purchase',exact:true}).click();
 await page.getByLabel('Purchasing agent',{exact:true}).selectOption(controls.agentId);
 await page.getByLabel('Merchant',{exact:true}).selectOption(controls.merchantId);
 await page.getByLabel('Amount (USD)',{exact:true}).fill('742.35');
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

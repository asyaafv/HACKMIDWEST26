/** Private PostgreSQL acceptance joins MCP submission and main-dashboard enterprise review without payment side effects. */
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
  app = createApp(runtime, { origins: [frontend], browserHosts: [`127.0.0.1:${apiPort}`], mcpHosts: [`127.0.0.1:${apiPort}`] });
  await app.listen({ host: '127.0.0.1', port: apiPort });
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(uiPort),'--strictPort'], { cwd: '../frontend', env: { ...process.env, GATE_API_URL: base }, stdio: 'ignore' });
  for (let tries = 0; ; tries++) {
    try { if ((await fetch(`${frontend}/live`)).ok) break; } catch { /* Wait for the owned Vite process. */ }
    if (tries >= 100 || vite.exitCode !== null) throw new Error('Private frontend failed to start.'); await sleep(100);
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
});
afterAll(async () => { await browser?.close(); if (vite && vite.exitCode === null) { const stopped = new Promise(resolve => vite.once('exit', resolve)); vite.kill('SIGTERM'); await stopped; } await app?.close(); await runtime?.end(); await admin?.end(); await pg.stop(); });
it('main dashboard reviews a real MCP request without payments, jobs, or budget mutations', async () => {
 const gatekeeper=await provisionGatekeeper(admin,{orgId:controls.orgId,projectId:controls.projectId,name:'Integration Gatekeeper'});
 const client=new Client({name:'main dashboard acceptance',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${gatekeeper.token}`}}}));
 try {
  const proposal={agentId:gatekeeper.agentId,projectId:controls.projectId,merchantId:controls.merchantId,amountMinor:'170001',currency:'USD',category:'diagnostics',purpose:'Main dashboard MCP request',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}};
  const request=await callGateTool(client,'gate_request_spend',{...proposal,idempotency_key:randomUUID()}) as {id:string};
  const page=await browser.newPage();page.setDefaultTimeout(5000);await page.goto(frontend);
  await page.getByLabel('Local access token').fill(controls.identities.FINANCE!.token);await page.getByRole('button',{name:'Connect to backend'}).click();
  await browserExpect(page.getByRole('heading',{name:'Workspace overview'})).toBeVisible();
  await page.getByRole('button',{name:new RegExp(`Open ${request.id}`)}).click();
  await browserExpect(page.getByText('Main dashboard MCP request',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Approve request',exact:true}).click();
  await browserExpect(page.getByLabel('Decision reason')).toBeVisible();await page.getByLabel('Decision reason').fill('Reviewed verified context and exact proposal');
  for(const checkbox of await page.locator('dialog input[type=checkbox]').all())await checkbox.check();
  await page.getByRole('button',{name:'Record approval'}).click();await browserExpect(page.locator('dialog')).toHaveCount(0);
  const outcome=await callGateTool(client,'gate_get_request',{request_id:request.id}) as {workflowStatus:string;payment:unknown;authorizationStatus:string};
  expect(outcome.workflowStatus).toBe('AUTHORIZED');expect(outcome.authorizationStatus).toBe('REVIEWED');expect(outcome.payment).toBeNull();
  for(const table of ['payments','jobs','simulator_transactions','budget_entries'])expect((await admin.query(`SELECT count(*) FROM ${table}`)).rows[0].count).toBe('0');
  expect((await admin.query('SELECT reserved_minor,spent_minor FROM budgets WHERE project_id=$1',[controls.projectId])).rows[0]).toMatchObject({reserved_minor:'0',spent_minor:'0'});
  expect((await admin.query("SELECT count(*) FROM audit_events WHERE packet->>'event'='review.approved'")).rows[0].count).toBe('1');
  await page.reload();await browserExpect(page.getByRole('heading',{name:'Connect to Gate'})).toBeVisible();
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(controls.identities.FINANCE!.token);await page.close();
 } finally {await client.close();}
});
it('main request form retries a committed lost response without duplicate records or fixture fallback',async()=>{
 const page=await browser.newPage();page.setDefaultTimeout(5000);await page.goto(frontend);
 await page.getByLabel('Local access token').fill(controls.identities.OPERATOR!.token);await page.getByRole('button',{name:'Connect to backend'}).click();
 await browserExpect(page.getByRole('heading',{name:'Workspace overview'})).toBeVisible();await page.getByRole('button',{name:'Create request',exact:true}).click();
 await page.getByLabel('Gatekeeper',{exact:true}).selectOption(controls.agentId);await page.getByLabel('Merchant',{exact:true}).selectOption(controls.merchantId);
 await page.getByLabel('Amount (USD)',{exact:true}).fill('200.01');await page.getByLabel('Business purpose',{exact:true}).fill('Lost main-dashboard response');
 await page.getByLabel('Find supporting evidence').fill('GATE-ISSUE-101');await page.getByRole('button',{name:'Search sources'}).click();
 await browserExpect(page.getByLabel('Supporting source').locator('option')).toHaveCount(2);await page.getByLabel('Supporting source').selectOption('pm:GATE-ISSUE-101');
 await page.route('**/v1/requests',async route=>{if(route.request().method()!=='POST')return route.continue();await route.fetch();await route.abort('failed');await page.unroute('**/v1/requests');});
 await page.getByRole('button',{name:'Check and submit'}).click();await browserExpect(page.locator('dialog [role=alert]').first()).toContainText('Response lost');
 await page.getByRole('button',{name:'Check and submit'}).click();await browserExpect(page.locator('dialog')).toHaveCount(0);
 expect((await admin.query("SELECT count(*) FROM requests WHERE proposal->>'purpose'='Lost main-dashboard response'")).rows[0].count).toBe('1');
 await browserExpect(page.getByText('Lost main-dashboard response',{exact:true})).toBeVisible();
 expect((await admin.query('SELECT count(*) FROM payments')).rows[0].count).toBe('0');
 const id=(await admin.query("SELECT id FROM requests WHERE proposal->>'purpose'='Lost main-dashboard response'")).rows[0].id;
 const forbidden=await fetch(`${base}/v1/requests/${id}/review`,{method:'POST',headers:{authorization:`Bearer ${controls.identities.OPERATOR!.token}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:'{}'});expect(forbidden.status).toBe(403);
 expect((await fetch(`${base}/dev-console`)).status).toBe(404);await page.close();
});

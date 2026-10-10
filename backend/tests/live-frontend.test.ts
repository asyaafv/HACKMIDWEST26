/** Private PostgreSQL acceptance joins MCP submission, browser finance consent, and real worker receipts. */
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
import { GateWorker } from '../src/worker.js';
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
it('MCP proposal appears in the live finance UI and returns a captured worker receipt', async () => {
  const gatekeeper = await provisionGatekeeper(admin, { orgId: controls.orgId, projectId: controls.projectId, name: 'Integration Gatekeeper' });
  const client = new Client({ name: 'local Gatekeeper acceptance', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${gatekeeper.token}` } } }));
  try {
    const tools = (await client.listTools()).tools; expect(tools.some(t => t.name.includes('consent'))).toBe(false);
    const proposal = { agentId: gatekeeper.agentId, projectId: controls.projectId, merchantId: controls.merchantId, amountMinor: '170000', currency: 'USD', category: 'diagnostics', purpose: 'MCP to browser integration', source: { domain: 'pm', sourceId: 'GATE-ISSUE-101' } };
    const request = await callGateTool(client, 'gate_request_spend', { ...proposal, idempotency_key: randomUUID() }) as { id: string };
    const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(`${frontend}/live`);
    await page.getByLabel('Local bearer token').fill(controls.identities.FINANCE!.token); await page.getByRole('button', { name: 'Connect locally' }).click();
    await browserExpect(page.getByRole('heading', { name: 'FINANCE workspace' })).toBeVisible();
    await page.getByRole('button', { name: /MCP to browser integration/ }).click();
    await page.getByRole('button', { name: 'Generate exact consent preview' }).click();
    await browserExpect(page.getByRole('heading', { name: 'Review exact purchase' })).toBeVisible();
    await page.getByLabel('Finance reason').fill('Reviewed exact amount, destination and verified source');
    for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
    await page.getByRole('button', { name: 'Authorize exact sandbox purchase' }).click();
    await browserExpect(page.getByRole('status')).toContainText('Consent recorded');
    await new GateWorker(runtime).runOnce();
    await page.getByRole('button', { name: 'Refresh outcome', exact: true }).click();
    await browserExpect(page.getByText(/Workflow: COMPLETED/)).toBeVisible();
    const outcome = await callGateTool(client, 'gate_get_request', { request_id: request.id }) as { payment: { status: string; holdState: string; receipt: unknown } };
    expect(outcome.payment.status).toBe('SUCCEEDED'); expect(outcome.payment.holdState).toBe('CAPTURED'); expect(outcome.payment.receipt).toBeTruthy();
    expect((await admin.query('SELECT count(*) FROM simulator_transactions')).rows[0].count).toBe('1'); await page.close();
  } finally { await client.close(); }
});
it('a committed proposal with a lost response replays through the UI without duplicate requests', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(`${frontend}/live`);
  await page.getByLabel('Local bearer token').fill(controls.identities.OPERATOR!.token); await page.getByRole('button', { name: 'Connect locally' }).click();
  await browserExpect(page.getByRole('heading', { name: 'OPERATOR workspace' })).toBeVisible();
  await page.getByLabel('Assigned Gatekeeper').selectOption(controls.agentId); await page.getByLabel('Merchant', { exact: true }).selectOption(controls.merchantId);
  await page.getByLabel('Purpose', { exact: true }).fill('Lost frontend response'); await page.getByLabel('Amount in USD').fill('200.00');
  await page.getByLabel('Search imported evidence').fill('GATE-ISSUE-101'); await page.getByRole('button', { name: 'Search sources' }).click();
  await browserExpect(page.getByLabel('Authorized source').locator('option')).toHaveCount(2); await page.getByLabel('Authorized source').selectOption('pm:GATE-ISSUE-101');
  await page.route('**/v1/requests', async route => { if (route.request().method() !== 'POST') return route.continue(); await route.fetch(); await route.abort('failed'); await page.unroute('**/v1/requests'); });
  await page.getByRole('button', { name: 'Submit sandbox request' }).click(); await browserExpect(page.getByRole('alert')).toContainText('Response lost');
  await page.getByRole('button', { name: 'Submit sandbox request' }).click(); await browserExpect(page.getByRole('status')).toContainText('Request recorded');
  await page.getByRole('button', { name: 'Submit sandbox request' }).evaluate(button => { const form = (button as HTMLButtonElement).form!; form.requestSubmit(); form.requestSubmit(); });
  await browserExpect(page.getByRole('status')).toContainText('Request recorded');
  expect((await admin.query("SELECT count(*) FROM requests WHERE proposal->>'purpose'='Lost frontend response'")).rows[0].count).toBe('1');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(controls.identities.OPERATOR!.token); await page.close();
});

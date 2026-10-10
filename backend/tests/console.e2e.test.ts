/** Isolated browser acceptance uses real REST, PostgreSQL, synthetic sources and worker. */
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { chromium, type Browser, type Page, expect as browserExpect } from '@playwright/test';
import EmbeddedPostgres from 'embedded-postgres';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Pool, type DB } from '../src/db.js';
import { migrate } from '../scripts/migrate.js';
import { prepareDemo, seedControls } from '../scripts/seed.js';
import { createApp } from '../src/app.js';
import { GateWorker } from '../src/worker.js';
import { verifyChain } from '../src/audit.js';
import { requestResponseSchema, previewResponseSchema } from '../src/contracts.js';
const port = 59000 + process.pid % 500;
const pg = new EmbeddedPostgres({ databaseDir:`work/console-test-${randomUUID()}`,user:'console_test',password:'isolated_test_only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{} });
let admin: DB, runtime: DB, browser: Browser, app: ReturnType<typeof createApp>, base: string;
let controls: Awaited<ReturnType<typeof seedControls>>, operator: Page, finance: Page;
const examples: Record<string, unknown> = {};
beforeAll(async () => {
 await pg.initialise(); await pg.start(); await pg.createDatabase('console_tests');
 const connectionString=`postgresql://console_test:isolated_test_only@127.0.0.1:${port}/console_tests`;
 admin=new Pool({connectionString}); await migrate(admin); runtime=new Pool({connectionString,options:'-c role=gate_runtime'});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
});
afterAll(async()=>{await browser?.close();await app?.close();await runtime?.end();await admin?.end();await pg.stop();});
beforeEach(async()=>{
 await operator?.context().close(); await finance?.context().close(); await app?.close();
 app=createApp(runtime,{devConsole:true,origins:['http://127.0.0.1:58555'],browserHosts:['127.0.0.1:58555']});
 await app.listen({host:'127.0.0.1',port:58555}); base='http://127.0.0.1:58555';
 // Only this private database is reset; actual seed provisioning supplies role capabilities.
 await admin.query('TRUNCATE organizations CASCADE'); controls=await seedControls(admin);
 await prepareDemo(admin);
 operator=await browser.newPage();finance=await browser.newPage();
 for(const [page,role] of [[operator,'OPERATOR'],[finance,'FINANCE']] as const){await page.goto(`${base}/dev-console`);await page.locator('#token').fill(controls.identities[role]!.token);await page.locator('#connect-form button').first().click();await browserExpect(page.locator('#identity')).toContainText(role);await browserExpect(page.locator('#message')).toContainText('Backend response received');}
});
async function propose(amount='1700.00',source='GATE-ISSUE-101'){
 await operator.locator('#amount').fill(amount);await operator.locator('#purpose').fill('Synthetic browser acceptance diagnostics');await operator.locator('#query').fill(source);await operator.locator('#search').click();await browserExpect(operator.locator('#source option')).toHaveCount(1);
 await operator.locator('#submit').click();await browserExpect(operator.locator('#message')).toContainText('Backend response received');await browserExpect(operator.locator('#detail')).toContainText('workflowStatus');
 const detail=JSON.parse(await operator.locator('#detail').innerText());requestResponseSchema.parse(detail);return detail;
}
async function review(id:string){await finance.locator('#request-id').fill(id);await finance.locator('#open-form button').click();await browserExpect(finance.locator('#detail')).toContainText(id);await finance.locator('#preview').click();await browserExpect(finance.locator('#message')).toContainText('Backend response received');await browserExpect(finance.locator('#preview-detail')).toContainText('previewHash');const p=JSON.parse(await finance.locator('#preview-detail').innerText());previewResponseSchema.parse(p);return p;}
async function approve(){await finance.locator('#reason').fill('Reviewed synthetic evidence and exact sandbox destination');for(const checkbox of await finance.locator('#resolutions input').all())await checkbox.check();await finance.locator('#approve').focus();await finance.keyboard.press('Enter');await browserExpect(finance.locator('#outcome')).toContainText('AUTHORIZED');}
async function getRequest(id:string){const response=await fetch(`${base}/v1/requests/${id}`,{headers:{authorization:`Bearer ${controls.identities.OPERATOR!.token}`}});return (await response.json()).data;}
it('S2: separate sessions, keyboard consent, real receipt, balances, source and audit',async()=>{
 const r=await propose();await operator.locator('#citations button').first().click();await browserExpect(operator.locator('#source-detail')).toContainText('sourceHash');
 const p=await review(r.id);await approve();await new GateWorker(runtime).runOnce();
 await operator.locator('#open-form button').click();await browserExpect(operator.locator('#outcome')).toContainText('SUCCEEDED');await browserExpect(operator.locator('#balances')).toContainText('$1700.00');
 const before=(await admin.query('SELECT count(*) FROM source_records')).rows[0].count;
 await prepareDemo(admin); expect((await admin.query('SELECT count(*) FROM source_records')).rows[0].count).toBe(before);
 const current=await getRequest(r.id);expect(current.payment.holdState).toBe('CAPTURED');requestResponseSchema.parse(current);
 const events=(await admin.query('SELECT * FROM audit_events WHERE org_id=$1 ORDER BY sequence',[controls.orgId])).rows;const head=(await admin.query('SELECT head_hash FROM audit_heads WHERE org_id=$1',[controls.orgId])).rows[0];expect(verifyChain(events,head.head_hash)).toBe(true);
 examples.S2={request:current,preview:p};await mkdir('work/console-acceptance',{recursive:true});await operator.screenshot({path:'work/console-acceptance/S2.png',fullPage:true});
 await writeFile('work/console-acceptance/scenario-responses.json',JSON.stringify(examples,null,2));
});
it('S1 still requires finance; operator role denial and transport double click keep one request',async()=>{
 const r=await propose('200.00');expect(r.decision.verdict).toBe('APPROVE');expect(r.payment).toBeNull();
 await operator.locator('#submit').dblclick();await browserExpect(operator.locator('#message')).toContainText('Backend response received');expect((await admin.query('SELECT count(*) FROM requests')).rows[0].count).toBe('1');
 await browserExpect(operator.locator('#preview')).toBeDisabled();
 const denial=await fetch(`${base}/v1/requests/${r.id}/preview`,{method:'POST',headers:{authorization:`Bearer ${controls.identities.OPERATOR!.token}`,'idempotency-key':randomUUID()}});expect(denial.status).toBe(403);await browserExpect(operator.locator('#approve')).toBeDisabled();
 await review(r.id);await approve();await new GateWorker(runtime).runOnce();expect((await getRequest(r.id)).payment.status).toBe('SUCCEEDED');
});
it('S3 hard denial and S4 source gap cannot produce previews or payments',async()=>{
 let r=await propose('6000.00');expect(r.workflowStatus).toBe('REJECTED');
 await operator.locator('#new-proposal').click();r=await propose('200.00','GATE-ISSUE-303');expect(r.workflowStatus).toBe('AWAITING_EVIDENCE');
 await finance.locator('#request-id').fill(r.id);await finance.locator('#open-form button').click();await browserExpect(finance.locator('#detail')).toContainText(r.id);await browserExpect(finance.locator('#preview')).toBeDisabled();
 const blocked=await fetch(`${base}/v1/requests/${r.id}/preview`,{method:'POST',headers:{authorization:`Bearer ${controls.identities.FINANCE!.token}`,'idempotency-key':randomUUID()}});expect(blocked.status).toBe(409);expect((await admin.query('SELECT count(*) FROM payments')).rows[0].count).toBe('0');
});
it('a second preview invalidates old consent; finance rejection dispatches nothing',async()=>{
 const r=await propose();await review(r.id);
 await fetch(`${base}/v1/requests/${r.id}/preview`,{method:'POST',headers:{authorization:`Bearer ${controls.identities.FINANCE!.token}`,'idempotency-key':randomUUID(),'content-type':'application/json'},body:'{}'});
 await finance.locator('#reason').fill('Reject stale purchase');await finance.locator('#reject').click();await browserExpect(finance.locator('#message')).toContainText('STALE_PREVIEW');await browserExpect(finance.locator('#approve')).toBeDisabled();
 await review(r.id);await finance.locator('#reject').click();await browserExpect(finance.locator('#outcome')).toContainText('REJECTED');expect((await admin.query('SELECT count(*) FROM payments')).rows[0].count).toBe('0');
});
it('cancellation before dispatch releases held funds',async()=>{
 const r=await propose();await review(r.id);await approve();await operator.locator('#cancel').click();await browserExpect(operator.locator('#outcome')).toContainText('CANCELLED');await new GateWorker(runtime).runOnce();expect((await admin.query('SELECT count(*) FROM simulator_transactions')).rows[0].count).toBe('0');expect((await admin.query('SELECT reserved_minor FROM budgets')).rows[0].reserved_minor).toBe('0');
});
it.each(['DECLINE','TIMEOUT_AFTER_COMMIT'])('real worker %s outcome and retrieval recovery',async mode=>{
 const r=await propose();await review(r.id);await approve();
 const payment = (await getRequest(r.id)).payment;
 const fault = await fetch(`${base}/v1/payments/${payment.id}/fault`,{method:'POST',headers:{authorization:`Bearer ${controls.identities.ADMIN!.token}`,'idempotency-key':randomUUID(),'content-type':'application/json'},body:JSON.stringify({mode})});expect(fault.status).toBe(200);await new GateWorker(runtime).runOnce();let state=await getRequest(r.id);
 if(mode==='DECLINE'){expect(state.payment.status).toBe('FAILED');expect(state.payment.holdState).toBe('RELEASED');}
 else {expect(state.payment.status).toBe('UNKNOWN');expect(state.payment.holdState).toBe('HELD');await finance.locator('#open-form button').click();await browserExpect(finance.locator('#outcome')).toContainText('UNKNOWN');await finance.locator('#reconcile').click();await browserExpect(finance.locator('#outcome')).toContainText('SUCCEEDED');state=await getRequest(r.id);expect(state.payment.holdState).toBe('CAPTURED');}
 expect((await admin.query('SELECT count(*) FROM simulator_transactions')).rows[0].count).toBe('1');
});
it('lost REST response retries same proposal without another purchase',async()=>{
 await operator.route('**/v1/requests',async route=>{if(route.request().method()!=='POST')return route.continue();await route.fetch();await route.abort('failed');await operator.unroute('**/v1/requests');});
 await operator.locator('#purpose').fill('Lost response acceptance');await operator.locator('#query').fill('GATE-ISSUE-101');await operator.locator('#search').click();await browserExpect(operator.locator('#source option')).toHaveCount(1);await operator.locator('#submit').click();await browserExpect(operator.locator('#message')).toContainText('unknown');await operator.locator('#submit').click();await browserExpect(operator.locator('#message')).toContainText('Backend response received');await browserExpect(operator.locator('#detail')).toContainText('AWAITING_CONSENT');expect((await admin.query('SELECT count(*) FROM requests')).rows[0].count).toBe('1');
});

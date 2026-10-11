/** Presentation-only mock contracts support visual tests; real database acceptance is in backend tests. */
import { expect, type Page } from '@playwright/test';
import { seed, merchants } from '../../src/data';
export async function mockBackend(page: Page, withRequests = true) {
 const demo=seed();
 const requests=withRequests?demo.transactions.map(t=>({id:t.id,version:1,createdAt:t.createdAt,proposal:{agentId:t.agentId,merchantId:t.merchantId,projectId:'visual-project',amountMinor:String(t.amount),currency:'USD',category:'diagnostics',purpose:t.purpose,source:{domain:'pm',sourceId:'VISUAL_TEST_ONLY'}},workflowStatus:t.decision==='Pending'?'AWAITING_CONSENT':t.decision==='Blocked'?'REJECTED':'AUTHORIZED',consentStatus:t.decision==='Approved'?'GRANTED':'NONE',authorizationStatus:t.decision==='Approved'?'REVIEWED':'NONE',decision:{verdict:t.decision==='Blocked'?'REJECT':t.decision==='Pending'?'REVIEW':'APPROVE',riskScore:t.risk,policyVersion:'VISUAL_TEST_ONLY',rules:[],factors:[],reviewRequirements:[]},evidence:{items:[],links:[],missing:[],bundleHash:'VISUAL_TEST_ONLY'},payment:null,snapshotHash:'a'.repeat(64),transactionReview:t.decision==='Pending'?null:{choice:t.decision==='Approved'?'approve':'reject',reason:'VISUAL_TEST_ONLY'}})):[];
 await page.route('**/v1/demo/dashboard', route=>route.fulfill({json:{data:{identity:{id:'test-human',orgId:'test-org',role:'FINANCE',capabilities:['request:read','catalog:read','finance:consent']},catalog:{agents:demo.agents.map(a=>({id:a.id,name:a.name,active:a.active,project_id:'visual-project',owner_id:'test-human',cap_minor:'500000'})),projects:[{id:'visual-project',name:'Visual test project'}],merchants:merchants.map(m=>({id:m.id,name:m.name,status:'VISUAL_TEST_ONLY'})),budgets:[],policy:{version:'VISUAL_TEST_ONLY'}},requests,events:[]}}}));
}
export async function connectExistingFixture(page: Page) {
 const skip=page.getByRole('button',{name:'Skip intro'});if(await skip.isVisible())await skip.click();
 await expect(page.getByRole('link',{name:'Open profile settings'})).toBeAttached();
}
export async function connectFixture(page: Page, path: string, withRequests = true) {
 await mockBackend(page,withRequests);await page.goto(path);await connectExistingFixture(page);
}

/** Presentation-only mock contracts support visual tests; real database acceptance is in backend tests. */
import { expect, type Page } from '@playwright/test';
import { seed, merchants } from '../../src/data';
export async function connectFixture(page: Page, path: string, withRequests = true) {
 const demo=seed();
 await page.route('**/v1/me', route=>route.fulfill({json:{data:{id:'test-human',orgId:'test-org',role:'AUDITOR',capabilities:['request:read','catalog:read','context:read']}}}));
 const requests=withRequests?demo.transactions.map(t=>({id:t.id,version:1,createdAt:t.createdAt,proposal:{agentId:t.agentId,merchantId:t.merchantId,projectId:'visual-project',amountMinor:String(t.amount),currency:'USD',category:'diagnostics',purpose:t.purpose,source:{domain:'pm',sourceId:'VISUAL_TEST_ONLY'}},workflowStatus:t.decision==='Pending'?'AWAITING_CONSENT':t.decision==='Blocked'?'REJECTED':'AUTHORIZED',consentStatus:t.decision==='Approved'?'GRANTED':'NONE',authorizationStatus:t.decision==='Approved'?'REVIEWED':'NONE',decision:{verdict:t.decision==='Blocked'?'REJECT':t.decision==='Pending'?'REVIEW':'APPROVE',riskScore:t.risk,policyVersion:'VISUAL_TEST_ONLY',rules:[],factors:[],reviewRequirements:[]},evidence:{items:[],links:[],missing:[],bundleHash:'VISUAL_TEST_ONLY'},payment:null})):[];
 await page.route('**/v1/dashboard', route=>route.fulfill({json:{data:{catalog:{agents:demo.agents.map(a=>({id:a.id,name:a.name,active:a.active,project_id:'visual-project',owner_id:'test-human',cap_minor:'500000'})),projects:[{id:'visual-project',name:'Visual test project'}],merchants:merchants.map(m=>({id:m.id,name:m.name,status:'VISUAL_TEST_ONLY'})),budgets:[],policy:{version:'VISUAL_TEST_ONLY'}},requests,events:[]}}}));
 await page.goto(path);await page.getByLabel('Local access token').fill('VISUAL_TEST_ONLY');await page.getByRole('button',{name:'Connect to backend'}).click();
 await expect(page.getByText('CONNECTED',{exact:true})).toBeAttached();
}

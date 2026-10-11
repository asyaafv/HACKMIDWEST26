/** Explicit mock API contracts, not evidence of a live DevRev agent run. */
import {test,expect,type Page} from '@playwright/test';
import {seed,merchants} from '../../src/data';
import {connectExistingFixture} from './backend-fixture';
const requestId='9de772b5-4c6f-41b1-9510-46eb74ac28b9',runId='d3b32a82-a6d8-47e9-b2ea-852d4a95bde4';
async function fixture(page:Page,ready=true,role='OPERATOR') {
 const demo=seed(),agent=demo.agents[0],merchant=merchants[0];let started=false,posts=0;
 const identity={id:'test-human',orgId:'test-org',role,capabilities:['request:read','catalog:read']};
 const dashboard={catalog:{agents:[{id:agent.id,name:agent.name,active:true,owner_id:identity.id,project_id:'test-project',cap_minor:'500000'}],projects:[{id:'test-project',name:'Test project'}],merchants:[{id:merchant.id,name:merchant.name,status:'ALLOWED'}],budgets:[],policy:{}},events:[],requests:[{id:requestId,version:1,createdAt:new Date().toISOString(),proposal:{agentId:agent.id,merchantId:merchant.id,projectId:'test-project',amountMinor:'100001',currency:'USD',category:'diagnostics',purpose:'API fixture only'},workflowStatus:'AWAITING_EVIDENCE',authorizationStatus:'NONE',consentStatus:'NONE',payment:null,transactionReview:null,snapshotHash:'a'.repeat(64),decision:{verdict:'REVIEW',riskScore:85,policyVersion:'TEST',rules:[],factors:[],reviewRequirements:[]},evidence:{items:[],links:[],missing:['Required evidence'],complete:false,unresolvedRequirements:['REQUIRED_EVIDENCE_MISSING']}}]};
 await page.addInitScript(()=>sessionStorage.setItem('gate.csrf','fixture-csrf'));
 await page.route('**/v1/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data:unknown;
  if(path==='/v1/auth/me')data=identity;
  else if(path==='/v1/dashboard')data=dashboard;
  else if(path==='/v1/orchestrations/status')data={ready,blockers:ready?[]:['ORCHESTRATION_DISABLED'],financialApproval:false};
  else if(path===`/v1/requests/${requestId}/orchestrations`)data={items:started?[{id:runId}]:[]};
  else if(path==='/v1/orchestrations'&&req.method()==='POST'){
   expect(req.postDataJSON()).toEqual({requestId});expect(req.headers()['x-csrf-token']).toBe('fixture-csrf');expect(req.headers()).not.toHaveProperty('authorization');
   expect(req.headers()['idempotency-key']).toBeTruthy();started=true;posts++;data={runId};
  }else if(path===`/v1/orchestrations/${runId}`)data={run:{id:runId,status:'HUMAN_REVIEW_REQUIRED',snapshot:{version:1},escalation:{reason:'Required evidence missing',nextAction:'Independent human review required',financialApproval:false}},stages:[1,2,3].map(ordinal=>({id:`stage-${ordinal}`,ordinal,status:'SUCCEEDED',agent_id:`fixture-agent-${ordinal}`,agent_version:`fixture-version-${ordinal}`,session_id:`fixture-session-${ordinal}`,findings:{agentCommentary:{summary:`Verified fixture finding ${ordinal}`}},tool_result:{traceId:`fixture-trace-${ordinal}`}})),events:[{ignored:false,event:{type:'message'}}]};
  else {await route.fulfill({status:404,json:{error:{code:'UNEXPECTED_TEST_ENDPOINT',message:path}}});return;}
  await route.fulfill({json:{data}});
 });
 await page.goto(`/transactions?request=${requestId}`);await connectExistingFixture(page);
 return ()=>posts;
}
test('existing panel starts a cookie-authenticated review and restores the persisted run without another start',async({page})=>{
 const posts=await fixture(page);const panel=page.getByRole('region',{name:'Gatekeeper investigation'});
 await expect(panel.getByRole('button',{name:'Run DevRev review'})).toBeEnabled();await panel.getByRole('button',{name:'Run DevRev review'}).click();
 await expect(panel).toContainText(runId);await expect(panel).toContainText('Risk & Fraud: SUCCEEDED');await expect(panel).toContainText('Verified fixture finding 3');await expect(panel).toContainText('Independent human review required');
 await panel.getByText('DevRev execution records').click();await expect(panel).toContainText('fixture-trace-3');expect(posts()).toBe(1);
 await page.reload();await connectExistingFixture(page);await expect(panel).toContainText(runId);await expect(panel.getByRole('button',{name:'Run DevRev review'})).toBeDisabled();expect(posts()).toBe(1);
});
test('reports missing backend configuration instead of fabricating a handoff',async({page})=>{
 const posts=await fixture(page,false);const panel=page.getByRole('region',{name:'Gatekeeper investigation'});
 await expect(panel).toContainText('DevRev orchestration is disabled on the backend.');await expect(panel.getByRole('button',{name:'Run DevRev review'})).toBeDisabled();await expect(panel).not.toContainText('SUCCEEDED');expect(posts()).toBe(0);
});
test('finance cannot initiate advisory orchestration',async({page})=>{
 const posts=await fixture(page,true,'FINANCE');const panel=page.getByRole('region',{name:'Gatekeeper investigation'});
 await expect(panel).toContainText('An authorized OPERATOR or ADMIN');await expect(panel.getByRole('button',{name:'Run DevRev review'})).toBeDisabled();expect(posts()).toBe(0);
});

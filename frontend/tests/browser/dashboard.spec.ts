/** Focused UX checks for the simplified finance queue and real published DevRev roster. */
import { test, expect } from '@playwright/test';
import { connectFixture } from './backend-fixture';
import { seed, merchants } from '../../src/data';
import { publishedAgents } from '../../src/published-agents';
import { dateLabel } from '../../src/data';

test('root opens Transactions, primary navigation has two pages, and profile retains sign-in access',async({page})=>{
 await connectFixture(page,'/');
 await expect(page).toHaveURL(/\/transactions$/);
 await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('link')).toHaveText(['Transactions','Gatekeepers']);
 await expect(page.locator('.sidebar nav a')).toHaveCount(2);
 await page.getByRole('link',{name:'Sign in or open settings'}).click();
 await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
 await expect(page.getByLabel('Username',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
});

test('transaction detail uses stored request data and keeps references in the collapsed details section',async({page})=>{
 const expected=seed().transactions[0],merchant=merchants.find(item=>item.id===expected.merchantId)!;
 await connectFixture(page,'/transactions');
 const row=page.locator('tbody tr').filter({hasText:expected.purpose});
 await row.getByRole('button').click();
 const panel=page.locator('.detail-panel');
 await expect(panel).toBeVisible();
 await expect(panel.getByText('Purchase request',{exact:true})).toBeVisible();
 await expect(panel.getByRole('heading',{name:merchant.name,exact:true})).toBeVisible();
 await expect(panel.getByText(expected.purpose,{exact:true})).toBeVisible();
 await expect(panel.getByText(dateLabel(expected.createdAt),{exact:true})).toBeVisible();
 await expect(panel.locator('.risk-score')).toContainText(String(expected.risk));
 await expect(panel.locator('.transaction-more')).not.toHaveAttribute('open','');
 await expect(panel.getByText(expected.id,{exact:true})).toBeHidden();
 await expect(panel.getByRole('button',{name:'Approve purchase'})).toHaveCount(0);
 await expect(panel.getByRole('button',{name:'Reject purchase'})).toHaveCount(0);
});

test('Gatekeepers shows exactly the three published agents and no placeholder status or purchase controls',async({page})=>{
 await connectFixture(page,'/gatekeepers');
 const cards=page.locator('.published-agent-card');
 await expect(cards).toHaveCount(3);
 await expect(cards.locator('.animated-avatar')).toHaveCount(3);
 for(const agent of publishedAgents){
  const card=cards.filter({has:page.getByRole('heading',{name:agent.name,exact:true})});
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-agent-id',agent.id);
  await expect(card).toContainText(agent.description);
 }
 await expect(page.getByText(/Gate Diagnostics Agent|DevRev Gatekeeper Review|Active|Paused/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:/purchase/i})).toHaveCount(0);
});

test('backend failure shows an error without login or fixture records',async({page})=>{
 await page.route('**/v1/**',r=>r.fulfill({status:503,json:{error:{code:'DEMO_NOT_CONFIGURED',message:'Workspace unavailable'}}}));
 await page.goto('/');const skip=page.getByRole('button',{name:'Skip intro'});if(await skip.isVisible())await skip.click();
 await expect(page.getByRole('heading',{name:'The backend couldn’t load'})).toBeVisible();
 await expect(page.getByLabel('Local access token')).toHaveCount(0);await expect(page.locator('tbody tr')).toHaveCount(0);
});

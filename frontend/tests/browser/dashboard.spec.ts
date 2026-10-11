/** Main frontend never substitutes browser-local sample records for authenticated backend data. */
import { test, expect } from '@playwright/test';
import { connectFixture } from './backend-fixture';
test('database-backed empty state and read-only configuration replace the old demo',async({page})=>{
 await connectFixture(page,'/transactions',false);await expect(page.getByRole('heading',{name:'Authorization queue'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'No transactions yet'})).toBeVisible();await expect(page.getByText('CONNECTED',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Gatekeepers',exact:true}).click();await expect(page.getByRole('button',{name:'Create Gatekeeper',exact:true})).toBeDisabled();
 await page.getByRole('link',{name:'Policies',exact:true}).click();await expect(page.getByText('VISUAL_TEST_ONLY')).toBeVisible();await expect(page.getByRole('button',{name:'Save policy'})).toHaveCount(0);
});
test('backend failure shows an error without login or fixture records',async({page})=>{
 await page.route('**/v1/**',r=>r.fulfill({status:503,json:{error:{code:'DEMO_NOT_CONFIGURED',message:'Workspace unavailable'}}}));
 await page.goto('/');const skip=page.getByRole('button',{name:'Skip intro'});if(await skip.isVisible())await skip.click();
 await expect(page.getByRole('heading',{name:'The backend couldn’t load'})).toBeVisible();
 await expect(page.getByLabel('Local access token')).toHaveCount(0);await expect(page.locator('tbody tr')).toHaveCount(0);
});

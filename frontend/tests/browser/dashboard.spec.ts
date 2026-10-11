/** Main frontend never substitutes browser-local sample records for authenticated backend data. */
import { test, expect } from '@playwright/test';
import { connectFixture } from './backend-fixture';
test('database-backed empty state and read-only configuration replace the old demo',async({page})=>{
 await connectFixture(page,'/transactions',false);await expect(page.getByRole('heading',{name:'Authorization queue'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'No matching transactions'})).toBeVisible();await expect(page.locator('.topbar')).not.toContainText(/Refresh|Disconnect|CONNECTED/);
 await page.getByRole('link',{name:'Gatekeepers',exact:true}).click();await expect(page.getByRole('button',{name:'Simulate purchase',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Create Gatekeeper',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Policies',exact:true}).click();await expect(page.getByText('VISUAL_TEST_ONLY')).toBeVisible();await expect(page.getByRole('button',{name:'Save policy'})).toHaveCount(0);
});
test('backend failure shows an error without login or fixture records',async({page})=>{
 await page.route('**/v1/**',r=>r.fulfill({status:503,json:{error:{code:'DEMO_NOT_CONFIGURED',message:'Workspace unavailable'}}}));
 await page.goto('/');const skip=page.getByRole('button',{name:'Skip intro'});if(await skip.isVisible())await skip.click();
 await expect(page.getByRole('heading',{name:'The backend couldn’t load'})).toBeVisible();
 await expect(page.getByLabel('Local access token')).toHaveCount(0);await expect(page.locator('tbody tr')).toHaveCount(0);
});

test('clickable agent cards preserve hover feedback and inspect backend records without editing', async ({ page }) => {
 await connectFixture(page, '/gatekeepers');
 await expect(page.locator('.gate-entrance')).toHaveCount(0);
 const card = page.locator('.gatekeeper-card').filter({ has: page.getByRole('heading', { name: 'Procurement-07', exact: true }) });
 await page.emulateMedia({ reducedMotion: 'no-preference' });
 await card.hover();
 await expect(card).toHaveCSS('scale', '1.015');
 await expect(card.locator('.animated-avatar')).toHaveCSS('scale', '1.055');
 const open = card.getByRole('button', { name: 'Open Procurement-07', exact: true });
 await open.focus(); await open.press('Enter');
 const dialog = page.getByRole('dialog', { name: 'Procurement-07', exact: true });
 await expect(dialog).toContainText('Agent ID');
 await expect(dialog.getByText('Department', { exact: true })).toBeVisible();
 await expect(dialog.getByRole('textbox')).toHaveCount(0);
 await page.keyboard.press('Escape'); await expect(open).toBeFocused();
 await open.click();
 await dialog.getByRole('link', { name: 'View requests' }).click();
 await expect(page).toHaveURL(/search=Procurement-07/);
 await expect(page.locator('tbody tr')).toHaveCount(4);
 const portrait = page.locator('table .animated-avatar').first();
 await portrait.hover(); await expect(portrait).toHaveCSS('scale', '1.1');
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(portrait).toHaveCSS('scale', 'none');
});

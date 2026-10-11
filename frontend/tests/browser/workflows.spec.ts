import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('queue selection, filters, sections, search, and copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Authorization queue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All 24', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approved 18', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Evidence 5' }).click();
  await expect(page.getByRole('button', { name: 'Business purpose' })).toBeVisible();
  await page.getByRole('tab', { name: 'Policies 6' }).click();
  await expect(page.getByRole('heading', { name: 'Evaluation snapshot' })).toBeVisible();
  await page.getByRole('button', { name: 'REQ-1842', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('REQ-1842');
  await page.getByRole('button', { name: 'Close transaction details' }).click();
  await page.getByRole('button', { name: 'Pending 3', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Open REQ-1838 AWS' }).click();
  await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close transaction details' }).click();
  const search = page.getByRole('textbox', { name: 'Search transactions, agents, merchants, or request IDs' });
  await search.fill('REQ-1842'); await search.press('Enter');
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('Gatekeeper dialog, original avatar selection, persistence, and pause', async ({ page }) => {
  await page.goto('/gatekeepers');
  await page.getByRole('button', { name: 'Create Gatekeeper', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Research-11');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Researches tools and prepares procurement requests.');
  await page.getByRole('radio', { name: 'Character 5', exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Create Gatekeeper', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Research-11' })).toBeVisible();
  await page.reload();
  const card = page.locator('.gatekeeper-card').filter({ has: page.getByRole('heading', { name: 'Research-11' }) });
  await expect(card.locator('svg image').first()).toHaveAttribute('href', '/assets/characters/character_05.png');
  const openCard = card.getByRole('button', { name: 'Open Research-11', exact: true });
  await expect(page.locator('.gate-entrance')).toHaveCount(0);
  await openCard.focus();
  await openCard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Research-11');
  await page.keyboard.press('Escape');
  await expect(openCard).toBeFocused();
  await card.getByRole('button', { name: 'Edit Research-11' }).click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Evaluates new developer tools.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(card).toContainText('Evaluates new developer tools.');
  await card.getByRole('button', { name: 'Pause Research-11' }).click();
  await expect(card).toContainText('Paused');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/audit-log');
  await expect(page.getByRole('button', { name: 'Research-11 paused' })).toBeVisible();
});

test('policy edit, new request, review decision, and shared audit/counts', async ({ page }) => {
  await page.goto('/policies');
  await page.getByRole('button', { name: /Autonomous approval limit/ }).click();
  await page.getByRole('spinbutton', { name: 'Limit (USD)' }).fill('100');
  await page.getByRole('button', { name: 'Save policy', exact: true }).click();
  await expect(page.locator('.policy-editor')).toContainText('Version 2');
  await page.goto('/transactions?tab=requests&request=none');
  await page.getByRole('button', { name: 'Create request', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount (USD)' }).fill('200');
  await page.getByRole('textbox', { name: 'Project', exact: true }).fill('Engineering expansion');
  await page.getByRole('textbox', { name: 'Business purpose', exact: true }).fill('Purchase software licenses for new hires');
  await page.getByRole('button', { name: 'Check and submit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'REQ-1843', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('textbox', { name: 'Decision reason' }).fill('Approved for the engineering onboarding budget.');
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approved 19', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pending 3', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Audit log', exact: true }).click();
  await expect(page.locator('.panel-body')).toContainText('Approved for the engineering onboarding budget.');
  await page.reload();
  await expect(page.locator('.detail-panel')).toContainText('APPROVED');
});

test('settings save, notifications preference, and confirmed reset', async ({ page }) => {
  await page.goto('/settings');
  // fill() can target inert inputs, so wait until the welcome releases the form.
  await expect(page.locator('.gate-entrance')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Display name' }).fill('Casey Morgan');
  await page.getByRole('textbox', { name: 'Initials', exact: true }).fill('CM');
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Gate Lab');
  await page.getByRole('checkbox', { name: /Success notifications/ }).uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('link', { name: 'Open profile settings' })).toHaveText('CM');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('Gate Lab');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('Gate Lab');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('Atlas Software');
});

test('corrupt storage is retained until explicit recovery', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gate.demo.v1', '{corrupt'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The demo couldn’t load' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gate.demo.v1'))).toBe('{corrupt');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
});

test('open transaction panel follows responsive focus and scroll behavior', async ({ page }) => {
  await page.goto('/transactions');
  await expect(page.locator('.detail-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.setViewportSize({ width: 1440, height: 941 });
  await expect(page.getByRole('dialog', { name: 'GitHub transaction details' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await expect(page.locator('.detail-panel')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.detail-panel'))).toBe(true);
  await page.setViewportSize({ width: 1672, height: 941 });
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search transactions, agents, merchants, or request IDs' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Open profile settings' })).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 941 });
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('batched visual review and responsive checks', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await mkdir('.impeccable/review', { recursive: true });
  for (const width of [1672, 1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 941 });
    await page.goto('/transactions?request=none');
    await expect(page.getByRole('heading', { name: 'Authorization queue' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/queue-${width}.png`, fullPage: false });
    await page.getByRole('button', { name: 'Open REQ-1842 GitHub' }).click();
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
    await page.screenshot({ path: `.impeccable/review/detail-${width}.png`, fullPage: false });
    if (width < 1536) { await page.keyboard.press('Escape'); await expect(page.locator('.detail-panel')).toHaveCount(0); }
    await page.goto('/gatekeepers');
    await expect(page.getByRole('heading', { name: 'Gatekeepers', exact: true })).toBeVisible();
    await page.locator('.gatekeeper-card svg image').first().evaluate(async image => {
      const original = new Image(); original.src = image.getAttribute('href')!; await original.decode();
    });
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/gatekeepers-${width}.png`, fullPage: false });
    if (width === 390) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('link', { name: 'Policies', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Policies', exact: true })).toBeVisible();
    }
  }
  for (const route of ['overview', 'policies', 'audit-log', 'settings']) {
    for (const width of [1672, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 941 });
      await page.goto(`/${route}`); await page.evaluate(() => document.fonts.ready);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `.impeccable/review/${route}-${width}.png`, fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

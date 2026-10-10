import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { seed } from '../../src/data';
import { pendingRequests } from '../../src/decisions';
import type { DemoState } from '../../src/types';

async function loadState(page: Page, state: DemoState) {
  await page.addInitScript(value => localStorage.setItem('gate.demo.v1', JSON.stringify(value)), state);
}

async function saveDecision(page: Page, action: 'Approve' | 'Block') {
  await page.getByRole('button', { name: `${action} request`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Decision reason' }).fill('Reviewed business evidence and project budget.');
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
}

test('home leads with decisions, previews review order, and links to a focused inbox', async ({ page }) => {
  const state = seed();
  await loadState(page, state);
  const pending = pendingRequests(state.transactions);
  await page.goto('/');
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: '3 requests need your decision' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Needs a decision 3 pending requests' })).toBeVisible();
  const summary = await page.locator('.decision-summary').boundingBox();
  const metrics = await page.locator('.overview-metrics').boundingBox();
  expect(summary!.y + summary!.height).toBeLessThan(metrics!.y);
  await expect(page.locator('.decision-preview-row')).toHaveCount(3);
  await expect(page.locator('.decision-preview-row').first()).toContainText(pending[0].id);
  await page.getByRole('button', { name: 'Review next request', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/decisions\\?request=${pending[0].id}$`));
  await expect(page.locator('.detail-panel')).toContainText(pending[0].id);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Next transaction' }).click();
  await expect(page.locator('.detail-panel')).toContainText(pending[1].id);
  await page.getByRole('button', { name: 'Previous transaction' }).click();
  await expect(page.locator('.detail-panel')).toContainText(pending[0].id);
});

test('successful approvals and blocks advance, update counts, and complete the inbox', async ({ page }) => {
  const state = seed(); state.settings.notifications = false;
  await loadState(page, state);
  const pending = pendingRequests(state.transactions);
  await page.goto(`/decisions?request=${pending[0].id}`);
  for (let i = 0; i < pending.length; i++) {
    await saveDecision(page, i === 1 ? 'Block' : 'Approve');
    await expect(page.locator('.decision-confirmation')).toContainText(`${pending[i].id} ${i === 1 ? 'blocked' : 'approved'}`);
    await expect(page.locator('.decision-nav-count')).toHaveCount(i === pending.length - 1 ? 0 : 1);
    if (i < pending.length - 1) {
      await expect(page.locator('.decision-nav-count')).toHaveText(String(pending.length - i - 1));
      await expect(page.locator('.detail-panel')).toContainText(pending[i + 1].id);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  }
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await expect(page.locator('.decision-completion')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to overview' }).click();
  await expect(page.locator('.decision-summary')).toHaveClass(/caught-up/);
  await expect(page.getByRole('button', { name: 'Review next request', exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gate.demo.v1')!));
  expect(stored.transactions.filter((t: { decision: string }) => t.decision === 'Pending')).toHaveLength(0);
  expect(stored.events.filter((e: { type: string }) => e.type === 'decision')).toHaveLength(3);
});

test('saving the last selected request wraps to the first remaining request', async ({ page }) => {
  const state = seed(); await loadState(page, state);
  const pending = pendingRequests(state.transactions);
  await page.goto(`/decisions?request=${pending.at(-1)!.id}`);
  await saveDecision(page, 'Approve');
  await expect(page.locator('.detail-panel')).toContainText(pending[0].id);
  await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('failed persistence preserves the request and reason, and retry advances', async ({ page }) => {
  const state = seed(); await loadState(page, state);
  const pending = pendingRequests(state.transactions);
  await page.goto(`/decisions?request=${pending[0].id}`);
  await expect(page.locator('.detail-panel')).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      Storage.prototype.setItem = original;
      throw new Error('Storage quota');
    };
  });
  await saveDecision(page, 'Approve');
  await expect(page.getByRole('dialog')).toContainText('Your browser could not save this change');
  await expect(page.getByRole('textbox', { name: 'Decision reason' })).toHaveValue('Reviewed business evidence and project budget.');
  await expect(page.locator('.detail-panel')).toContainText(pending[0].id);
  await expect(page.locator('.decision-nav-count')).toHaveText('3');
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.locator('.detail-panel')).toContainText(pending[1].id);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('old requests remain actionable, resolved links explain, and missing links recover', async ({ page }) => {
  const state = seed();
  const pending = pendingRequests(state.transactions);
  pending[0].createdAt = new Date(Date.now() - 120 * 86400000).toISOString();
  await loadState(page, state);
  await page.goto('/decisions');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody tr').first().getByRole('button')).toHaveAttribute('aria-label', `Open ${pending[0].id} Deel`);
  await page.goto('/decisions?request=REQ-1842');
  await expect(page.locator('.decision-link-notice')).toContainText('REQ-1842 has already been approved.');
  await page.getByRole('link', { name: 'View transaction details' }).click();
  await expect(page).toHaveURL(/\/transactions\?request=REQ-1842$/);
  await expect(page.locator('.detail-panel')).toContainText('APPROVED');
  await page.goto('/decisions?request=missing');
  await expect(page.locator('.decision-link-notice')).toContainText('no longer available');
  await page.locator('.decision-link-notice').getByRole('button', { name: 'Review next request' }).click();
  await expect(page.locator('.detail-panel')).toContainText(pending[0].id);
});

for (const count of [0, 1, 3, 12]) {
  test(`overview handles ${count} pending requests`, async ({ page }) => {
    const state = seed();
    state.transactions.forEach((t, index) => { t.decision = index < count ? 'Pending' : 'Approved'; });
    await loadState(page, state);
    await page.goto('/overview');
    await expect(page.locator('.decision-preview-row')).toHaveCount(Math.min(count, 3));
    if (count) {
      await expect(page.locator('.decision-summary h2')).toHaveText(`${count} ${count === 1 ? 'request needs' : 'requests need'} your decision`);
      await page.getByRole('button', { name: `View all ${count}`, exact: true }).click();
      await expect(page.locator('tbody tr')).toHaveCount(count);
    } else {
      await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
      await expect(page.locator('.decision-nav-count')).toHaveCount(0);
      await page.goto('/decisions');
      await expect(page.getByRole('link', { name: 'Back to overview' })).toBeVisible();
    }
  });
}

test('desktop and mobile layout, keyboard review, and overlay focus', async ({ page }) => {
  await mkdir('.impeccable/review', { recursive: true });
  for (const width of [1672, 1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 941 });
    await page.goto('/overview');
    await expect(page.locator('.gate-entrance')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '3 requests need your decision' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const action = page.getByRole('button', { name: 'Review next request', exact: true });
    const bounds = await action.boundingBox(); expect(bounds!.y + bounds!.height).toBeLessThan(width === 390 ? 844 : 941);
    await page.screenshot({ path: `.impeccable/review/decisions-overview-${width}.png`, fullPage: true });
    await action.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.detail-panel')).toBeVisible();
    if (width < 1536) {
      await expect(page.locator('.detail-panel')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('.detail-panel'))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('.detail-panel')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    }
    await page.screenshot({ path: `.impeccable/review/decisions-inbox-${width}.png`, fullPage: true });
  }
});

test('mobile review requires a reason and restores focus and scrolling on completion', async ({ page }) => {
  const state = seed();
  const selected = pendingRequests(state.transactions)[0];
  state.transactions.forEach(t => { if (t.id !== selected.id) t.decision = 'Approved'; });
  state.settings.notifications = false;
  await loadState(page, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/decisions?request=${selected.id}`);
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Approve ${selected.id}` })).toBeVisible();
  await expect(page.locator('.decision-nav-count')).toHaveText('1');
  await page.getByRole('textbox', { name: 'Decision reason' }).fill('Business evidence supports this expense.');
  await page.getByRole('button', { name: 'Save decision', exact: true }).click();
  await expect(page.locator('.decision-completion')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.locator('.decision-confirmation')).toContainText('All requests have been reviewed.');
});

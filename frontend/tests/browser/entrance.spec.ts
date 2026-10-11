import { test, expect, type Page, type Route } from '@playwright/test';
import { mockBackend, connectExistingFixture } from './backend-fixture';

test.use({ reducedMotion: 'no-preference' });

async function freeze(page: Page) {
  const time = new Date('2026-10-10T12:00:00Z');
  await page.clock.install({ time }); await page.clock.pauseAt(time);
}
async function scene(page: Page) {
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'scene');
}
async function released(page: Page) {
  await expect(page.locator('.gate-entrance')).toHaveCount(0);
  expect(await page.locator('.entrance-workspace').evaluate(e => (e as HTMLElement).inert)).toBe(false);
  await expect(page.locator('.entrance-workspace')).toHaveCSS('filter', 'none');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await expect(page.locator('.entrance-canvas')).toHaveCount(0);
}

test('full sequence finishes, allows navigation, and replays on refresh', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await mockBackend(page);
  await freeze(page); await page.goto('/overview'); await scene(page);
  await expect(page.getByRole('button', { name: 'Skip intro' })).toBeFocused();
  expect(await page.locator('.entrance-workspace').evaluate(e => (e as HTMLElement).inert)).toBe(true);
  let previous = 0;
  for (const [time, phase] of [[1150, 'look-left'], [1650, 'blink'], [2400, 'look-right'], [3250, 'approved'], [4050, 'gate-opening'], [4900, 'handoff'], [5460, 'handoff']] as const) {
    await page.clock.fastForward(time - previous); previous = time;
    await expect(page.locator('.gate-entrance')).toHaveAttribute('data-phase', phase);
    if (phase === 'approved') await expect(page.locator('.entrance-approval')).toHaveCSS('opacity', '1');
  }
  await page.clock.fastForward(5800 - previous); await released(page);
  await expect(page.locator('#main-content')).toBeFocused();
  await connectExistingFixture(page);
  await page.getByRole('link', { name: 'Gatekeepers', exact: true }).click();
  await expect(page).toHaveURL(/gatekeepers/); await released(page);
  await page.reload(); await scene(page);
  await page.keyboard.press('Escape'); await released(page);
  expect(errors).toEqual([]);
});

test('skip, keyboard containment, direct routes, and history restoration', async ({ page }) => {
  await freeze(page); await page.goto('/transactions'); await scene(page);
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Skip intro' })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('button', { name: 'Skip intro' })).toBeFocused();
  await page.getByRole('button', { name: 'Skip intro' }).click(); await released(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await scene(page); await page.keyboard.press('Escape'); await released(page);
  await expect(page).toHaveURL(/transactions/);
});

for (const mobile of [false, true]) {
  test(`brand replays the full intro repeatedly${mobile ? ' on mobile' : ' on desktop'}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await mockBackend(page);
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await freeze(page); await page.goto('/gatekeepers'); await scene(page);
    await page.keyboard.press('Escape'); await released(page);
    await connectExistingFixture(page);
    const brand = page.getByRole('link', { name: 'Gate home and replay intro', exact: true });
    for (const keyboard of [false, true]) {
      if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
      if (keyboard) { await brand.focus(); await page.keyboard.press('Enter'); }
      else await brand.locator('img').click();
      await scene(page);
      await expect(page).toHaveURL(/overview/);
      await expect(page.getByRole('button', { name: 'Skip intro' })).toBeFocused();
      expect(await page.locator('.entrance-workspace').evaluate(e => (e as HTMLElement).inert)).toBe(true);
      await page.clock.fastForward(3250);
      await expect(page.locator('.gate-entrance')).toHaveAttribute('data-phase', 'approved');
      await page.clock.fastForward(2550); await released(page);
    }
    expect(errors).toEqual([]);
  });
}

test('reduced motion uses a brief static welcome and does not load WebGL', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await freeze(page); await page.goto('/');
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'reduced');
  await expect(page.locator('.entrance-static')).toBeVisible();
  await page.clock.fastForward(750); await released(page);
  await page.getByRole('link', { name: 'Gate home and replay intro', exact: true }).click();
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'reduced');
  await page.clock.fastForward(750); await released(page);
});

test('graphics failure and slow initialization never strand the dashboard', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await freeze(page); await page.goto('/');
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'fallback');
  await page.clock.fastForward(750); await released(page);
  let heldRequest: Route | undefined;
  await page.route('**/entrance-scene.ts*', route => { heldRequest = route; });
  await page.reload();
  await expect.poll(() => Boolean(heldRequest)).toBe(true);
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'loading');
  await page.clock.fastForward(1050);
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'fallback');
  await page.clock.fastForward(750); await released(page);
  await heldRequest!.abort();
});

test('hidden document expiry, context loss, and preference changes release resources', async ({ page }) => {
  await freeze(page); await page.goto('/'); await scene(page);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.fastForward(6000); await released(page);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await released(page);
  await page.reload(); await scene(page);
  await page.locator('canvas').evaluate(e => e.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'fallback');
  await page.clock.fastForward(750); await released(page);
  await page.reload(); await scene(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.gate-entrance')).toHaveAttribute('data-mode', 'reduced');
  await page.clock.fastForward(750); await released(page);
});

test('mobile completes without overflow or a hidden-logo flight', async ({ page }) => {
  await mockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await freeze(page); await page.goto('/'); await scene(page);
  await page.clock.fastForward(4900);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.clock.fastForward(1000); await released(page);
  await connectExistingFixture(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
});

test('direct mobile request keeps its own scroll lock and focus after welcome and automatic load', async ({ page }) => {
  await mockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await freeze(page); await page.goto('/transactions?request=REQ-1842'); await scene(page);
  await page.clock.fastForward(5900);
  await connectExistingFixture(page);
  await expect(page.locator('.detail-panel')).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await page.getByRole('button', { name: 'Close transaction details' }).click();
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await released(page);
});

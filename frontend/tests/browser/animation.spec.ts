import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

test('expressions can interrupt each other and replay; pause stops ambient motion', async ({ page }) => {
  await page.goto('/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  const apertures = rig.locator('.rig-outline');
  await expect(rig).toHaveAttribute('data-running', 'true');
  await page.getByRole('button', { name: 'Close eyes', exact: true }).click();
  await expect.poll(() => apertures.evaluateAll(es => es.every(e => Number(e.getAttribute('data-openness')) === 0))).toBe(true);
  await page.getByRole('button', { name: 'Look right', exact: true }).click();
  await expect.poll(() => rig.locator('.rig-pupil').first().evaluate(e => Number(e.getAttribute('transform')?.match(/translate\(([-\d.]+)/)?.[1]))).toBeGreaterThan(25);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Wink', exact: true }).click();
    await expect.poll(() => apertures.evaluateAll(es => Number(es[1].getAttribute('data-openness')) === 0 && Number(es[0].getAttribute('data-openness')) > .8), { intervals: [20, 30, 40] }).toBe(true);
    await expect.poll(() => apertures.last().evaluate(e => Number(e.getAttribute('data-openness')))).toBe(1);
  }
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(rig).toHaveAttribute('data-running', 'false');
  await expect(rig.locator('svg')).toHaveCSS('animation-play-state', 'paused');
  const frozen = await rig.locator('.rig-eye-pair').getAttribute('transform');
  const frozenEye = await rig.locator('.rig-outline').last().getAttribute('d');
  await page.waitForTimeout(400);
  await expect(rig.locator('.rig-eye-pair')).toHaveAttribute('transform', frozen!);
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('d', frozenEye!);
  await page.getByRole('button', { name: 'Resume animation', exact: true }).click();
  await expect(rig).toHaveAttribute('data-running', 'true');
});

test('reduced motion keeps controls usable; mobile has no overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  await expect(rig).toHaveAttribute('data-running', 'false');
  await page.getByRole('button', { name: 'Wink', exact: true }).click();
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '0');
  await expect(rig.locator('.rig-outline').first()).toHaveAttribute('data-openness', '1');
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('offscreen characters stop and every character uses the rig', async ({ page }) => {
  await page.goto('/animation-preview');
  await page.setViewportSize({ width: 390, height: 500 });
  const rig = page.locator('.motion-stage .animated-avatar');
  await page.getByRole('button', { name: 'Close eyes', exact: true }).scrollIntoViewIfNeeded();
  await expect(rig).toHaveAttribute('data-running', 'false');
  await page.goto('/gatekeepers');
  await expect(page.locator('.gatekeeper-card .animated-avatar')).toHaveCount(10);
  await expect(page.locator('.gatekeeper-card img.avatar')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Try the animated character' })).toBeVisible();
});


test('pointer tracking yields to explicit look controls and returns smoothly', async ({ page }) => {
  await page.goto('/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  await rig.hover({ position: { x: 430, y: 240 } });
  const pupilX = () => rig.locator('.rig-pupil').first().evaluate(e => Number(e.getAttribute('transform')?.match(/translate\(([-\d.]+)/)?.[1]));
  await expect.poll(pupilX).toBeGreaterThan(35);
  await page.getByRole('button', { name: 'Look left', exact: true }).click();
  await rig.hover({ position: { x: 430, y: 240 } });
  await expect.poll(pupilX).toBe(-42);
  await page.getByRole('button', { name: 'Look around', exact: true }).click();
  await rig.hover({ position: { x: 430, y: 240 } });
  await expect.poll(pupilX).toBeGreaterThan(35);
  await page.mouse.move(260, 100);
  await expect.poll(pupilX).toBe(0);
});


test('a wink resumes from its frozen pose after pause and hidden-tab suspension', async ({ page }) => {
  await page.clock.install();
  await page.goto('/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  await expect(rig).toHaveAttribute('data-running', 'true');
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.getByRole('button', { name: 'Wink', exact: true }).click();
  await page.clock.runFor(50);
  // Dispatch without Playwright's actionability wait advancing the fake clock.
  await page.getByRole('button', { name: 'Pause animation', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  const partial = await rig.locator('.rig-outline').last().getAttribute('data-openness');
  expect(Number(partial)).toBeGreaterThan(0);
  expect(Number(partial)).toBeLessThan(1);
  await page.clock.runFor(1000);
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', partial!);
  await page.getByRole('button', { name: 'Resume animation', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await page.clock.runFor(160);
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '0');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(rig).toHaveAttribute('data-running', 'false');
  await page.clock.runFor(1000);
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '0');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(400);
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '1');
});


test('every character has a clean plate, stable personality and larger table portraits', async ({ page }) => {
  for (let n = 1; n <= 10; n++) {
    const result = await page.request.get(`/assets/characters/character_${String(n).padStart(2, '0')}-clean-plate.png`);
    expect(result.ok()).toBe(true);
    expect(result.headers()['content-type']).toContain('image/png');
  }
  await page.goto('/gatekeepers');
  const assignments = await page.locator('.gatekeeper-card .animated-avatar').evaluateAll(es => es.map(e => e.getAttribute('data-motion')));
  expect(new Set(assignments).size).toBe(4);
  await page.reload();
  await expect(page.locator('.gatekeeper-card .animated-avatar')).toHaveCount(10);
  expect(await page.locator('.gatekeeper-card .animated-avatar').evaluateAll(es => es.map(e => e.getAttribute('data-motion')))).toEqual(assignments);
  for (const route of ['/transactions', '/overview']) {
    await page.goto(route);
    const portrait = page.locator('table .animated-avatar').first();
    await expect(portrait).toHaveCSS('width', '52px');
    await expect(portrait).toHaveCSS('height', '52px');
  }
  await page.goto('/animation-preview');
  await page.getByLabel('Character', { exact: true }).selectOption('7');
  await expect(page.locator('.motion-stage .animated-avatar')).toHaveAttribute('data-character', '7');
  await page.getByRole('button', { name: 'Close eyes', exact: true }).click();
  await expect(page.locator('.motion-stage .rig-outline').last()).toHaveAttribute('data-openness', '0');
});

test('dashboard agents take separate turns with quiet gaps instead of continuous loops', async ({ page }) => {
  await page.clock.install();
  await page.goto('/gatekeepers');
  await expect(page.locator('.gatekeeper-card .animated-avatar')).toHaveCount(10);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  let wasActive = false, lastEnded: number | null = null, turns = 0;
  for (let elapsed = 0; elapsed < 25000; elapsed += 200) {
    await page.clock.fastForward(200);
    const active = await page.locator('.animated-avatar[data-ambient-active="true"]').count();
    expect(active).toBeLessThanOrEqual(1);
    if (active && !wasActive) {
      turns++;
      if (lastEnded !== null) {
        expect(elapsed - lastEnded).toBeGreaterThanOrEqual(2800);
        expect(elapsed - lastEnded).toBeLessThanOrEqual(4200);
      }
    }
    if (!active && wasActive) lastEnded = elapsed;
    wasActive = active > 0;
  }
  expect(turns).toBeGreaterThanOrEqual(2);
  // Navigating during a live lease must release the old portrait safely.
  for (let i = 0; i < 8 && !(await page.locator('.animated-avatar[data-ambient-active="true"]').count()); i++) await page.clock.fastForward(2000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  expect(errors).toEqual([]);
});

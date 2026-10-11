import { test, expect } from '@playwright/test';
import { connectFixture } from './backend-fixture';

test.use({ reducedMotion: 'no-preference' });

test('some dashboard agents hold both eyes closed and smoothly reopen', async ({ page }) => {
  await connectFixture(page,'/gatekeepers');
  const resting = page.locator('.animated-avatar[data-action="rest-eyes"]');
  await expect.poll(() => resting.evaluateAll(avatars => avatars.some(avatar =>
    [...avatar.querySelectorAll('.rig-outline')].every(eye => eye.getAttribute('data-openness') === '0')
  )), { timeout: 12000, intervals: [50] }).toBe(true);
  const character = await resting.first().getAttribute('data-character');
  await expect.poll(() => page.locator(`.animated-avatar[data-character="${character}"] .rig-outline`).evaluateAll(eyes =>
    eyes.length === 2 && eyes.every(eye => eye.getAttribute('data-openness') === '1')
  ), { intervals: [50] }).toBe(true);
});

test('ambient turns change the rendered portrait, not only its activity flag', async ({ page }) => {
  await connectFixture(page,'/gatekeepers');
  await expect.poll(() => page.locator('.animated-avatar').evaluateAll(avatars => avatars.some(avatar => {
    const svg = avatar.querySelector('svg')!;
    const matrix = new DOMMatrix(getComputedStyle(svg).transform);
    const bodyMoved = Math.hypot(matrix.e, matrix.f) > .5 || Math.abs(matrix.b) > .005 || matrix.a > .98;
    const eyesMoved = [...avatar.querySelectorAll('.rig-outline')].some(eye => Number(eye.getAttribute('data-openness')) < .9)
      || [...avatar.querySelectorAll('.rig-eye-pair')].some(pupil => Math.abs(Number(pupil.getAttribute('transform')?.match(/translate\(([-\d.]+)/)?.[1])) > 10);
    return bodyMoved || eyesMoved;
  })), { timeout: 12000, intervals: [50] }).toBe(true);
});

test('expressions can interrupt each other and replay; pause stops ambient motion', async ({ page }) => {
  await connectFixture(page,'/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  const apertures = rig.locator('.rig-outline');
  await expect(rig).toHaveAttribute('data-running', 'true');
  await page.getByRole('button', { name: 'Close eyes', exact: true }).click();
  await expect.poll(() => apertures.evaluateAll(es => es.every(e => Number(e.getAttribute('data-openness')) === 0))).toBe(true);
  await page.getByRole('button', { name: 'Look right', exact: true }).click();
  await expect.poll(() => rig.locator('.rig-eye-pair').evaluate(e => Number(e.getAttribute('transform')?.match(/translate\(([-\d.]+)/)?.[1]))).toBeGreaterThan(25);
  await expect(rig.locator('.rig-pupil').first()).toHaveAttribute('transform', 'translate(0 0)');
  expect(await rig.locator('.rig-eye-pair .rig-outline').count()).toBe(2);
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
  await connectFixture(page,'/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  await expect(rig).toHaveAttribute('data-running', 'false');
  await page.getByRole('button', { name: 'Wink', exact: true }).click();
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '0');
  await expect(rig.locator('.rig-outline').first()).toHaveAttribute('data-openness', '1');
  // Mobile controls scroll the large preview offscreen, which suspends its timeline.
  await rig.scrollIntoViewIfNeeded();
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('offscreen characters stop and every character uses the rig', async ({ page }) => {
  await connectFixture(page,'/animation-preview');
  await page.setViewportSize({ width: 390, height: 500 });
  const rig = page.locator('.motion-stage .animated-avatar');
  await page.getByRole('button', { name: 'Close eyes', exact: true }).scrollIntoViewIfNeeded();
  await expect(rig).toHaveAttribute('data-running', 'false');
  await connectFixture(page,'/gatekeepers');
  await expect(page.locator('.gatekeeper-card .animated-avatar')).toHaveCount(10);
  await expect(page.locator('.gatekeeper-card img.avatar')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Try the animated character' })).toBeVisible();
});


test('pointer tracking yields to explicit look controls and returns smoothly', async ({ page }) => {
  await connectFixture(page,'/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  await rig.hover({ position: { x: 430, y: 240 } });
  const eyePairX = () => rig.locator('.rig-eye-pair').evaluate(e => Number(e.getAttribute('transform')?.match(/translate\(([-\d.]+)/)?.[1]));
  await expect.poll(eyePairX).toBeGreaterThan(35);
  await page.getByRole('button', { name: 'Look left', exact: true }).click();
  await rig.hover({ position: { x: 430, y: 240 } });
  await expect.poll(eyePairX).toBeCloseTo(-75, 2);
  await page.getByRole('button', { name: 'Look around', exact: true }).click();
  await rig.hover({ position: { x: 430, y: 240 } });
  await expect.poll(eyePairX).toBeGreaterThan(35);
  await page.mouse.move(260, 100);
  await expect.poll(eyePairX).toBeCloseTo(0, 2);
});


test('a wink resumes from its frozen pose after pause and hidden-tab suspension', async ({ page }) => {
  await page.clock.install();
  await connectFixture(page,'/animation-preview');
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
  await connectFixture(page,'/gatekeepers');
  const assignments = await page.locator('.gatekeeper-card .animated-avatar').evaluateAll(es => es.map(e => e.getAttribute('data-motion')));
  expect(new Set(assignments).size).toBe(4);
  await page.reload();
  await page.getByRole('button',{name:'Skip intro'}).click();
  await expect(page.locator('.gatekeeper-card .animated-avatar')).toHaveCount(10);
  expect(await page.locator('.gatekeeper-card .animated-avatar').evaluateAll(es => es.map(e => e.getAttribute('data-motion')))).toEqual(assignments);
  await expect(page.locator('.gatekeeper-card .animated-avatar').first()).toHaveCSS('width', '160px');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.gatekeeper-card .animated-avatar').first()).toHaveCSS('width', '128px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const route of ['/transactions', '/overview']) {
    await connectFixture(page,route);
    const portrait = page.locator('table .animated-avatar').first();
    await expect(portrait).toHaveCSS('width', '72px');
    await expect(portrait).toHaveCSS('height', '72px');
  }
  await connectFixture(page,'/animation-preview');
  await page.getByLabel('Character', { exact: true }).selectOption('7');
  await expect(page.locator('.motion-stage .animated-avatar')).toHaveAttribute('data-character', '7');
  await page.getByRole('button', { name: 'Close eyes', exact: true }).click();
  await expect(page.locator('.motion-stage .rig-outline').last()).toHaveAttribute('data-openness', '0');
});

test('dashboard agents animate independently with quiet gaps per portrait', async ({ page }) => {
  await page.clock.install();
  await connectFixture(page,'/gatekeepers');
  await expect(page.locator('.gatekeeper-card .animated-avatar')).toHaveCount(10);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  const previous = new Map<number, boolean>(), ended = new Map<number, number>();
  const animated = new Set<number>();
  let maxConcurrent = 0;
  for (let elapsed = 0; elapsed < 16000; elapsed += 200) {
    await page.clock.fastForward(200);
    const states = await page.locator('.animated-avatar').evaluateAll(es => es.map(e => e.getAttribute('data-ambient-active') === 'true'));
    maxConcurrent = Math.max(maxConcurrent, states.filter(Boolean).length);
    states.forEach((active, i) => {
      if (active && !previous.get(i)) {
        animated.add(i);
        if (ended.has(i)) {
          expect(elapsed - ended.get(i)!).toBeGreaterThanOrEqual(2800);
          expect(elapsed - ended.get(i)!).toBeLessThanOrEqual(4200);
        }
      }
      if (!active && previous.get(i)) ended.set(i, elapsed);
      previous.set(i, active);
    });
  }
  expect(maxConcurrent).toBeGreaterThan(1);
  expect(animated.size).toBeGreaterThan(1);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.resume();
  await connectFixture(page,'/overview');
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('only the selected transaction portrait floats and selection transfers immediately', async ({ page }) => {
  await connectFixture(page,'/transactions?request=REQ-1842');
  const selected = page.locator('tr.selected .animated-avatar');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute('data-selected', 'true');
  await expect(selected).toHaveCSS('animation-name', 'selected-avatar-float');
  await expect.poll(() => selected.evaluate(e => Math.abs(new DOMMatrix(getComputedStyle(e).transform).f)), { intervals: [50] }).toBeGreaterThan(3);
  const others = page.locator('tr:not(.selected) .animated-avatar');
  expect(await others.evaluateAll(es => es.every(e => getComputedStyle(e).animationName === 'none'))).toBe(true);
  const nextRow = page.locator('tbody tr:not(.selected)').first();
  const nextButton = nextRow.getByRole('button');
  const label = await nextButton.getAttribute('aria-label');
  await nextButton.click();
  await expect(page.getByRole('button', { name: label!, exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('table .animated-avatar[data-selected="true"]')).toHaveCount(1);
  expect(await others.evaluateAll(es => es.every(e => getComputedStyle(e).animationName === 'none'))).toBe(true);
});

test('preview float is opt-in, coexists with expressions, and stops on deselection', async ({ page }) => {
  await connectFixture(page,'/animation-preview');
  const rig = page.locator('.motion-stage .animated-avatar');
  const toggle = page.getByRole('button', { name: 'Float', exact: true });
  await expect(rig).toHaveCSS('animation-name', 'none');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => rig.evaluate(e => Math.abs(new DOMMatrix(getComputedStyle(e).transform).f)), { intervals: [50] }).toBeGreaterThan(12);
  await page.getByRole('button', { name: 'Close eyes', exact: true }).click();
  await expect(rig.locator('.rig-outline').last()).toHaveAttribute('data-openness', '0');
  await expect(rig).toHaveCSS('animation-play-state', 'running');
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(rig).toHaveCSS('animation-play-state', 'paused');
  await toggle.click();
  await expect(rig).toHaveCSS('animation-name', 'none');
  await expect(rig).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle.click();
  await expect(rig).toHaveCSS('animation-name', 'none');
});

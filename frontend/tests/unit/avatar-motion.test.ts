import { describe, expect, it } from 'vitest';
import { AvatarMotion, eyePath } from '../../src/avatar-motion';

function advance(rig: AvatarMotion, ms: number, reduced = false) {
  for (let remaining = ms; remaining > 0; remaining -= 10) rig.step(Math.min(10, remaining), null, reduced);
}

describe('Gatekeeper motion', () => {
  it('relaxed eye closure closes both eyes, holds for one second and fully reopens', () => {
    const rig = new AvatarMotion(() => .5);
    rig.playAmbient('rest-eyes');
    rig.step(70, null, false, false);
    expect(rig.eyes[0]).toBeGreaterThan(0);
    expect(rig.eyes[0]).toBeLessThan(1);
    rig.step(70, null, false, false); expect(rig.eyes).toEqual([0, 0]);
    rig.step(1000, null, false, false); expect(rig.eyes).toEqual([0, 0]);
    rig.step(130, null, false, false); expect(rig.eyes[0]).toBeGreaterThan(0);
    rig.step(130, null, false, false); expect(rig.eyes).toEqual([1, 1]);
  });
  it('blink reaches exact closure, holds it, and fully reopens at 310 ms', () => {
    const rig = new AvatarMotion(() => .5);
    rig.command('blink', false);
    advance(rig, 90); expect(rig.eyes).toEqual([0, 0]);
    advance(rig, 50); expect(rig.eyes).toEqual([0, 0]);
    advance(rig, 170); expect(rig.eyes).toEqual([1, 1]);
  });
  it('wink has a longer hold and suppresses automatic blinks through its cooldown', () => {
    const rig = new AvatarMotion(() => 0);
    advance(rig, 2350); rig.command('wink', false);
    advance(rig, 120); expect(rig.eyes).toEqual([.84, 0]);
    advance(rig, 210); expect(rig.eyes).toEqual([.84, 0]);
    advance(rig, 210); expect(rig.eyes).toEqual([1, 1]);
    advance(rig, 590); expect(rig.eyes).toEqual([1, 1]);
  });
  it('interrupts closure from the existing pose and freezes gaze during blinking', () => {
    const rig = new AvatarMotion(() => .5);
    rig.command('right', false); advance(rig, 180);
    rig.command('blink', false); advance(rig, 50);
    expect(rig.gaze).toEqual({ x: 42, y: 0 });
    const pose = [...rig.eyes];
    rig.command('left', false); expect(rig.eyes).toEqual(pose);
    advance(rig, 180); expect(rig.eyes).toEqual([1, 1]);
    expect(rig.gaze).toEqual({ x: -42, y: 0 });
  });
  it('explicit gaze overrides pointer tracking, and idle returns after pointer exit', () => {
    const rig = new AvatarMotion(() => .5);
    rig.command('left', false); rig.step(180, { x: 42, y: 16 }, false);
    expect(rig.gaze).toEqual({ x: -42, y: 0 });
    rig.command('idle', false); rig.step(10, { x: 42, y: 16 }, false);
    rig.step(180, { x: 42, y: 16 }, false);
    expect(rig.gaze).toEqual({ x: 42, y: 16 });
    rig.step(10, null, false); advance(rig, 300);
    expect(rig.gaze).toEqual({ x: 0, y: 0 });
  });
  it('automatic gaze uses noticeable glances, holds, returns and bounded sway', () => {
    const rig = new AvatarMotion(() => 0);
    advance(rig, 1280); expect(rig.gaze.x).toBeGreaterThan(-36);
    advance(rig, 320); expect(rig.gaze.x).toBe(-36);
    advance(rig, 1500); expect(rig.gaze.x).toBe(-36);
    expect(Math.abs(rig.sway.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(rig.sway.y)).toBeLessThanOrEqual(3);
    // An automatic blink suspends the return rather than consuming its duration.
    advance(rig, 1000); expect(rig.gaze.x).toBe(0);
  });
  it('resumes idle glances after transient expressions', () => {
    const rig = new AvatarMotion(() => .5);
    rig.command('wink', false); advance(rig, 2300);
    expect(Math.abs(rig.gaze.x)).toBeGreaterThanOrEqual(36);
  });
  it('reduced motion shows direct poses and restores transient expressions', () => {
    const rig = new AvatarMotion(() => .5);
    rig.command('wink', true); expect(rig.eyes).toEqual([1, 0]);
    advance(rig, 180, true); expect(rig.eyes).toEqual([1, 1]);
    rig.command('closed', true); advance(rig, 1000, true);
    expect(rig.eyes).toEqual([0, 0]); expect(rig.sway).toEqual({ x: 0, y: 0 });
    rig.command('right', true); expect(rig.gaze).toEqual({ x: 42, y: 0 });
  });
  it('uses a closed lens without non-finite geometry across the complete range', () => {
    for (const openness of [0, .01, .25, .5, .75, 1]) {
      const path = eyePath(430, openness);
      expect(path).toMatch(/^M .* Z$/); expect(path).not.toMatch(/NaN|Infinity/);
    }
    // Closed top and bottom coincide, leaving no aperture area for the pupils.
    expect(eyePath(430, 0)).toContain('430 620');
  });
});

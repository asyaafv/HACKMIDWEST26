import { describe, expect, it } from 'vitest';
import { AvatarDirector, type AmbientAction } from '../../src/avatar-director';

describe('independent ambient animation director', () => {
  it('starts every visible agent independently within one second', () => {
    const director = new AvatarDirector(() => 0);
    const started: string[] = [];
    for (const identity of ['agent-a', 'agent-b']) director.register(identity, {
      identity, enabled: true, start: () => started.push(identity), finish: () => {},
    });
    director.tick(0); director.tick(1000);
    expect(started).toEqual(['agent-a', 'agent-b']);
  });
  it('shares duplicate identity turns and changes actions after three seconds of rest', () => {
    const director = new AvatarDirector(() => 0);
    const actions: AmbientAction[] = [];
    let duration = 0;
    for (const key of ['row-a', 'row-b']) director.register(key, {
      identity: 'same-agent', enabled: true, start: (action, ms) => { actions.push(action); duration = ms; }, finish: () => {},
    });
    director.tick(0); director.tick(1000);
    expect(actions).toHaveLength(1);
    const end = 1000 + duration;
    director.tick(end); director.tick(end + 2999);
    expect(actions).toHaveLength(1);
    director.tick(end + 3000);
    expect(actions).toHaveLength(2);
    expect(actions[1]).not.toBe(actions[0]);
  });
  it('cancels a hidden/paused portrait and excludes disabled entries', () => {
    const director = new AvatarDirector(() => 0);
    let stopped = false, starts = 0;
    director.register('disabled', { identity: 'offscreen', enabled: false, start: () => { throw new Error('Must stay still'); }, finish: () => {} });
    director.register('visible', { identity: 'visible', enabled: true, start: () => { starts++; }, finish: () => { stopped = true; } });
    director.tick(0); director.tick(1000); expect(starts).toBe(1);
    director.setEnabled('visible', false); expect(stopped).toBe(true);
    director.tick(40000); expect(starts).toBe(1);
  });
});

// Exercise the normal cycle separately from selection's CSS float.
it('keeps float out of ambient turns and includes every eye expression', () => {
  let seed = 42;
  const director = new AvatarDirector(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
  const actions = new Set<string>();
  director.register('portrait', { identity: 'portrait', enabled: true, start: action => { actions.add(action); }, finish: () => {} });
  for (let now = 0; now <= 2000000; now += 1000) director.tick(now);
  expect(actions.has('float')).toBe(false);
  for (const action of ['glance', 'left', 'right', 'blink', 'wink', 'rest-eyes']) expect(actions.has(action)).toBe(true);
});

import { describe, expect, it } from 'vitest';
import { AvatarDirector, type AmbientAction } from '../../src/avatar-director';

describe('quiet ambient animation director', () => {
  it('leases one portrait at a time with a quiet interval between turns', () => {
    const director = new AvatarDirector(() => 0);
    let active = 0, starts = 0;
    for (const identity of ['agent-a', 'agent-b']) director.register(identity, {
      identity, enabled: true, start: () => { active++; starts++; expect(active).toBe(1); }, finish: () => { active--; },
    });
    director.tick(0); director.tick(2999); expect(starts).toBe(0);
    director.tick(3000); expect(starts).toBe(1);
    director.tick(5000); expect(starts).toBe(1);
    director.tick(9000); expect(active).toBe(0);
    director.tick(11999); expect(starts).toBe(1);
    director.tick(12000); expect(starts).toBe(2); expect(active).toBe(1);
  });
  it('rotates actions and enforces per-agent rest even with duplicate rows', () => {
    const director = new AvatarDirector(() => 0);
    const actions: AmbientAction[] = [];
    for (const key of ['row-a', 'row-b']) director.register(key, {
      identity: 'same-agent', enabled: true, start: a => actions.push(a), finish: () => {},
    });
    director.tick(0); director.tick(3000); director.tick(9000);
    director.tick(11999); expect(actions).toHaveLength(1);
    director.tick(12000); expect(actions).toHaveLength(2); expect(actions[1]).not.toBe(actions[0]);
  });
  it('cancels a hidden/paused portrait and excludes disabled entries', () => {
    const director = new AvatarDirector(() => 0);
    let stopped = false, started = false;
    director.register('disabled', { identity: 'offscreen', enabled: false, start: () => { throw new Error('Must stay still'); }, finish: () => {} });
    director.register('visible', { identity: 'visible', enabled: true, start: () => { started = true; }, finish: () => { stopped = true; } });
    director.tick(0); director.tick(3000); expect(started).toBe(true);
    director.setEnabled('visible', false); expect(stopped).toBe(true);
    director.tick(40000); expect(stopped).toBe(true);
  });
});

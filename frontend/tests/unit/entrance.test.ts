import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTRANCE_DURATION, entrancePose } from '../../src/entrance-timeline';
import { createEntranceAudio } from '../../src/entrance-audio';

describe('entrance choreography', () => {
  it('looks both ways, closes both eyes during the switch, then faces forward', () => {
    expect(entrancePose(1150).gaze).toBe(-1);
    expect(entrancePose(1650).eyes).toEqual([0, 0]);
    expect(entrancePose(2400).gaze).toBe(1);
    expect(entrancePose(2850).gaze).toBe(0);
    expect(entrancePose(2850).eyes).toEqual([1, 1]);
  });
  it('approves before opening and fully clears the gate before flight', () => {
    expect(entrancePose(3200).approval).toBe(1);
    expect(entrancePose(3499).gate).toBe(0);
    expect(entrancePose(3900).gate).toBeGreaterThan(0);
    expect(entrancePose(4399).flight).toBe(0);
    expect(entrancePose(4400).gate).toBe(1);
    expect(entrancePose(4750).flight).toBeGreaterThan(.8);
  });
  it('keeps both eyes open and shrinks toward the logo as soon as the gate clears', () => {
    expect(entrancePose(4400).handoff).toBe(0);
    expect(entrancePose(4600).handoff).toBeGreaterThan(0);
    expect(entrancePose(4900).eyes).toEqual([1, 1]);
    expect(entrancePose(5150).eyes).toEqual([1, 1]);
    expect(entrancePose(5400).handoff).toBeGreaterThan(0);
    expect(entrancePose(5799).done).toBe(false);
    expect(entrancePose(ENTRANCE_DURATION)).toMatchObject({ done: true, phase: 'complete', mascotOpacity: 0, scenery: 0, handoff: 1 });
  });
});

describe('best-effort approval audio', () => {
  afterEach(() => vi.unstubAllGlobals());
  const mockAudio = (initial: 'running' | 'suspended') => {
    const start = vi.fn(), stop = vi.fn(), close = vi.fn(async () => {}), resume = vi.fn(async () => {});
    const ctx = { state: initial as string, currentTime: 1, destination: {}, close, resume,
      createOscillator: vi.fn(() => ({ type: '', frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start, stop, onended: null })),
      createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }),
    };
    vi.stubGlobal('AudioContext', class { constructor() { return ctx; } });
    return { ctx, start, stop, close, resume };
  };
  it('plays exactly one two-note cue when audio is allowed and releases its context', () => {
    const mock = mockAudio('running'), audio = createEntranceAudio();
    audio.play(); audio.play();
    expect(mock.start).toHaveBeenCalledTimes(2);
    expect(mock.stop).toHaveBeenCalledTimes(2);
    audio.dispose(); expect(mock.close).toHaveBeenCalledOnce();
  });
  it('does not replay a blocked ding after later interaction', () => {
    const mock = mockAudio('suspended'), audio = createEntranceAudio();
    audio.play(); mock.ctx.state = 'running'; audio.unlock(); audio.play();
    expect(mock.start).not.toHaveBeenCalled(); expect(mock.resume).not.toHaveBeenCalled();
    audio.dispose();
  });
  it('can unlock before approval, and handles missing audio support', () => {
    const mock = mockAudio('suspended'), audio = createEntranceAudio();
    audio.unlock(); expect(mock.resume).toHaveBeenCalledOnce();
    mock.ctx.state = 'running'; audio.play(); expect(mock.start).toHaveBeenCalledTimes(2); audio.dispose();
    vi.stubGlobal('AudioContext', undefined);
    const unavailable = createEntranceAudio();
    expect(() => { unavailable.unlock(); unavailable.play(); unavailable.dispose(); }).not.toThrow();
  });
});

export const ENTRANCE_DURATION = 5800;
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const between = (time: number, start: number, end: number) => smooth((time - start) / (end - start));
const closeEye = (time: number, start: number, closed: number, release: number, end: number) =>
  1 - between(time, start, closed) + between(time, release, end);

/** Pure, seekable choreography. All scene and UI effects use this same clock. */
export function entrancePose(time: number) {
  const blink = closeEye(time, 1550, 1635, 1680, 1800);
  const handoff = between(time, 4400, ENTRANCE_DURATION);
  return {
    phase: time < 500 ? 'reveal' : time < 1550 ? 'look-left' : time < 1800 ? 'blink' : time < 2850 ? 'look-right' : time < 3500 ? 'approved' : time < 4400 ? 'gate-opening' : time < ENTRANCE_DURATION ? 'handoff' : 'complete',
    reveal: between(time, 0, 500),
    gaze: -between(time, 500, 850) + 2 * between(time, 1570, 1850) - between(time, 2675, 2850),
    eyes: [blink, blink] as const,
    approval: between(time, 2850, 3060) * (1 - between(time, 4050, 4400)),
    gate: between(time, 3500, 4400),
    flight: 1 - Math.pow(1 - clamp((time - 4400) / 400), 3),
    code: between(time, 250, 600) * (1 - between(time, 3150, 3950)),
    scenery: 1 - between(time, 4400, 5150),
    handoff,
    mascotOpacity: 1 - between(time, 5600, ENTRANCE_DURATION),
    done: time >= ENTRANCE_DURATION,
  };
}

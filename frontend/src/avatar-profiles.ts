export const motionStyles = ['float', 'drift', 'turn', 'breathe'] as const;
export type MotionStyle = typeof motionStyles[number];

// A deterministic random assignment keeps each agent's personality across routes/reloads.
export function avatarProfile(identity: string) {
  let seed = 2166136261;
  for (const char of identity) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return { style: motionStyles[seed % motionStyles.length], duration: 7 + (seed % 400) / 100, delay: -(seed % 700) / 100, seed };
}
export function seededRandom(seed: number) {
  let value = seed;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
export function characterRig(character: number) {
  if (character === 1) return { centers: [430, 815], cy: 606, rx: 126, ry: 129 };
  if (character === 2) return { centers: [432, 822], cy: 636, rx: 130, ry: 131 };
  if (character === 3) return { centers: [430, 824], cy: 630, rx: 133, ry: 135 };
  return { centers: [428, 824], cy: 604, rx: 133, ry: 135 };
}

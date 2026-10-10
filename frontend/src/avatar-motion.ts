export type Expression = 'idle' | 'left' | 'right' | 'blink' | 'wink' | 'closed';
type Point = { x: number; y: number };
type Transition = { from: Point; to: Point; start: number; duration: number };
type Gesture = { kind: 'blink' | 'wink' | 'closed' | 'open' | 'rest-eyes'; start: number; from: number[] };
const ease = (v: number) => 1 - (1 - Math.max(0, Math.min(1, v))) ** 3;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const CENTER = { x: 0, y: 0 };

/** Both the outline and pupil aperture use this same continuously closing lens. */
export function eyePath(cx: number, openness: number, cy = 606, radiusX = 126, radiusY = 129) {
  const o = Math.max(0, Math.min(1, openness));
  const rx = mix(86, radiusX, o), edge = mix(cy - 7, cy, o);
  const top = mix(cy + 14, cy - radiusY, o), bottom = mix(cy + 14, cy + radiusY, o);
  const k = .55228475, left = cx - rx, right = cx + rx;
  return `M ${left} ${edge} C ${left} ${mix(edge, top, k)} ${cx - rx * k} ${top} ${cx} ${top} C ${cx + rx * k} ${top} ${right} ${mix(edge, top, k)} ${right} ${edge} C ${right} ${mix(edge, bottom, k)} ${cx + rx * k} ${bottom} ${cx} ${bottom} C ${cx - rx * k} ${bottom} ${left} ${mix(edge, bottom, k)} ${left} ${edge} Z`;
}

/** Persistent local timeline: callers advance only while visible and unpaused. */
export class AvatarMotion {
  time = 0;
  mode: Expression = 'idle';
  eyes = [1, 1];
  gaze: Point = { ...CENTER };
  sway: Point = { ...CENTER };
  private transition: Transition | null = null;
  private gesture: Gesture | null = null;
  private phase: 'center' | 'glance' | 'hold' | 'return' = 'center';
  private phaseEnd = 1100;
  private nextBlink = 2400;
  private blinkSuppressedUntil = 0;
  private ambientReturnAt: number | null = null;
  private tracking = false;
  private pointerGoal: Point = { ...CENTER };
  constructor(private random: () => number = Math.random) {
    this.nextBlink += random() * 1500;
  }
  private move(to: Point, duration: number) {
    this.transition = { from: { ...this.gaze }, to, start: this.time, duration };
  }
  rest() {
    this.mode = 'idle'; this.eyes = [1, 1]; this.gaze = { ...CENTER }; this.sway = { ...CENTER };
    this.transition = null; this.gesture = null; this.ambientReturnAt = null; this.tracking = false;
  }
  playAmbient(action: 'glance' | 'left' | 'right' | 'blink' | 'wink' | 'rest-eyes') {
    if (action === 'rest-eyes') {
      this.mode = 'idle'; this.ambientReturnAt = null;
      this.gesture = { kind: 'rest-eyes', start: this.time, from: [...this.eyes] };
      return;
    }
    if (action === 'left' || action === 'right') {
      this.command(action, false);
      this.ambientReturnAt = this.time + 2000;
      return;
    }
    if (action !== 'glance') { this.command(action, false); return; }
    this.mode = 'idle';
    this.move({ x: (this.random() < .5 ? -1 : 1) * (36 + this.random() * 6), y: (this.random() * 2 - 1) * 16 }, 500);
    this.ambientReturnAt = this.time + 2000;
  }
  command(mode: Expression, reduced: boolean) {
    this.ambientReturnAt = null;
    this.mode = mode;
    this.tracking = false;
    this.gesture = { kind: mode === 'blink' || mode === 'wink' || mode === 'closed' ? mode : 'open', start: this.time, from: [...this.eyes] };
    if (mode === 'wink') this.blinkSuppressedUntil = this.time + 1140;
    // Begin the next deliberate idle sequence without resetting the timeline.
    if (mode === 'idle') { this.phase = 'return'; this.phaseEnd = this.time + 300; }
    if (mode === 'left' || mode === 'right' || mode === 'closed' || mode === 'idle') {
      const goal = { x: mode === 'left' ? -42 : mode === 'right' ? 42 : 0, y: 0 };
      if (reduced) { this.gaze = goal; this.transition = null; } else this.move(goal, mode === 'idle' ? 300 : 180);
    }
    if (reduced) {
      this.eyes = mode === 'blink' || mode === 'closed' ? [0, 0] : mode === 'wink' ? [1, 0] : [1, 1];
      this.sway = { ...CENTER };
    }
  }
  step(dt: number, pointer: Point | null, reduced: boolean, automatic = true) {
    this.time += dt;
    const t = this.time;
    const g = this.gesture;
    if (reduced) {
      this.sway = { ...CENTER };
      if (g && (g.kind === 'blink' || g.kind === 'wink') && t - g.start >= 180) { this.eyes = [1, 1]; this.gesture = null; }
      return;
    }
    let gestureFinished = false;
    if (g) {
      const age = t - g.start;
      const wink = g.kind === 'wink', resting = g.kind === 'rest-eyes';
      const closing = resting ? 140 : wink ? 120 : 90, holding = resting ? 1000 : wink ? 220 : 60, opening = resting ? 260 : wink ? 200 : 160;
      if (g.kind === 'open') {
        const progress = ease(age / 160);
        this.eyes = g.from.map(o => mix(o, 1, progress));
        gestureFinished = age >= 160;
      } else if (g.kind === 'closed') {
        this.eyes = g.from.map(o => mix(o, 0, ease(age / 90)));
      } else {
        const from = wink ? [.84, 0] : [0, 0];
        if (age < closing) this.eyes = g.from.map((o, i) => mix(o, from[i], ease(age / closing)));
        else if (age < closing + holding) this.eyes = [...from];
        else this.eyes = from.map(o => mix(o, 1, ease((age - closing - holding) / opening)));
        gestureFinished = age >= closing + holding + opening;
      }
      if (gestureFinished) { this.eyes = [1, 1]; this.gesture = null; }
    }
    if (this.ambientReturnAt !== null && t >= this.ambientReturnAt) { this.move(CENTER, 600); this.ambientReturnAt = null; }
    const freezeGaze = this.gesture?.kind === 'blink' || this.gesture?.kind === 'wink' || this.gesture?.kind === 'rest-eyes';
    if (freezeGaze) {
      // Shift gaze deadlines so a gesture cannot consume the glance/hold duration.
      if (this.transition) this.transition.start += dt;
      this.phaseEnd += dt;
    } else {
      const usesPointer = this.mode === 'idle' && pointer !== null;
      if (usesPointer) {
        const goal = { x: Math.max(-42, Math.min(42, pointer.x)), y: Math.max(-16, Math.min(16, pointer.y)) };
        if (!this.tracking || Math.hypot(goal.x - this.pointerGoal.x, goal.y - this.pointerGoal.y) > .5) {
          this.move(goal, 180); this.pointerGoal = goal;
        }
        this.tracking = true;
      } else if (this.tracking) {
        this.tracking = false; this.move(CENTER, 300); this.phase = 'return'; this.phaseEnd = t + 300;
      } else if (automatic && (this.mode === 'idle' || this.mode === 'blink' || this.mode === 'wink') && t >= this.phaseEnd) {
        if (this.phase === 'center') {
          const x = (this.random() < .5 ? -1 : 1) * (36 + this.random() * 6);
          const y = (this.random() * 2 - 1) * 16;
          this.move({ x, y }, 500); this.phase = 'glance'; this.phaseEnd = t + 500;
        } else if (this.phase === 'glance') { this.phase = 'hold'; this.phaseEnd = t + 1500 + this.random() * 1500; }
        else if (this.phase === 'hold') { this.move(CENTER, 600); this.phase = 'return'; this.phaseEnd = t + 600; }
        else { this.phase = 'center'; this.phaseEnd = t + 1000 + this.random() * 700; }
      }
      if (this.transition) {
        const p = ease((t - this.transition.start) / this.transition.duration);
        this.gaze = { x: mix(this.transition.from.x, this.transition.to.x, p), y: mix(this.transition.from.y, this.transition.to.y, p) };
        if (p === 1) this.transition = null;
      }
    }
    const follow = 1 - Math.exp(-dt / 100);
    this.sway.x = mix(this.sway.x, this.gaze.x / 42 * 8, follow);
    this.sway.y = mix(this.sway.y, this.gaze.y / 16 * 3, follow);
    if (automatic && !this.gesture && this.mode !== 'closed' && t >= this.nextBlink && t >= this.blinkSuppressedUntil) {
      this.gesture = { kind: 'blink', start: t, from: [...this.eyes] };
      this.nextBlink = t + 3200 + this.random() * 3500;
    }
  }
}

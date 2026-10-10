import { avatarProfile } from './avatar-profiles';
const ambientActions = ['drift', 'turn', 'breathe', 'glance', 'left', 'right', 'blink', 'wink', 'nod', 'lean', 'rest-eyes'] as const;
export type AmbientAction = typeof ambientActions[number];
const durations: Record<AmbientAction, number> = { drift: 4000, turn: 4200, breathe: 3800, glance: 3100, left: 2800, right: 2800, blink: 310, wink: 540, nod: 2400, lean: 3200, 'rest-eyes': 1400 };
type Entry = { identity: string; enabled: boolean; start: (action: AmbientAction, duration: number) => void; finish: () => void };

/** Independent staggered turns; duplicate rows still share a single identity lease. */
export class AvatarDirector {
  private entries = new Map<string, Entry>();
  private history = new Map<string, { action?: AmbientAction; next: number }>();
  private active = new Map<string, { key: string; until: number }>();
  private now = 0;
  constructor(private random: () => number = Math.random) {}
  register(key: string, entry: Entry) {
    this.entries.set(key, entry);
    return () => { this.setEnabled(key, false); this.entries.delete(key); };
  }
  setEnabled(key: string, enabled: boolean) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.enabled = enabled;
    if (!enabled && this.active.get(entry.identity)?.key === key) this.end(entry.identity, this.now);
  }
  private end(identity: string, now: number) {
    const turn = this.active.get(identity);
    if (!turn) return;
    this.entries.get(turn.key)?.finish();
    this.active.delete(identity);
    this.history.set(identity, { ...this.history.get(identity), next: now + 3000 + this.random() * 1000 });
  }
  tick(now: number) {
    this.now = now;
    for (const [identity, turn] of this.active) if (now >= turn.until) this.end(identity, now);
    for (const [key, entry] of this.entries) {
      if (!entry.enabled || this.active.has(entry.identity)) continue;
      let prior = this.history.get(entry.identity);
      if (!prior) {
        prior = { next: now + avatarProfile(entry.identity).seed % 1000 };
        this.history.set(entry.identity, prior);
      }
      if (now < prior.next) continue;
      const options = ambientActions.filter(action => action !== prior.action);
      // Some agents begin with a relaxed eye closure; others start with body motion.
      const profile = avatarProfile(entry.identity);
      const action = prior.action ? options[Math.floor(this.random() * options.length)] : profile.seed % 3 === 0 ? 'rest-eyes' : profile.style === 'float' ? 'glance' : profile.style;
      this.history.set(entry.identity, { action, next: now });
      this.active.set(entry.identity, { key, until: now + durations[action] });
      entry.start(action, durations[action]);
    }
  }
}
export const avatarDirector = new AvatarDirector();

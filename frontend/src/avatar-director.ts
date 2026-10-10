import { avatarProfile, motionStyles } from './avatar-profiles';
export type AmbientAction = typeof motionStyles[number] | 'glance' | 'blink' | 'wink';
const durations: Record<AmbientAction, number> = { float: 3600, drift: 4000, turn: 4200, breathe: 3800, glance: 3100, blink: 310, wink: 540 };
type Entry = { identity: string; enabled: boolean; start: (action: AmbientAction, duration: number) => void; finish: () => void };

/** One shared lease across all visible portraits; repeated rows never get parallel turns. */
export class AvatarDirector {
  private entries = new Map<string, Entry>();
  private history = new Map<string, { action: AmbientAction; next: number; last: number }>();
  private active: { key: string; until: number } | null = null;
  private next = -1;
  constructor(private random: () => number = Math.random) {}
  register(key: string, entry: Entry) {
    this.entries.set(key, entry);
    return () => { this.setEnabled(key, false); this.entries.delete(key); };
  }
  setEnabled(key: string, enabled: boolean) {
    const entry = this.entries.get(key);
    if (entry) entry.enabled = enabled;
    if (!enabled && this.active?.key === key) this.end(this.active.until);
  }
  private end(now: number) {
    if (!this.active) return;
    const entry = this.entries.get(this.active.key);
    entry?.finish();
    if (entry) {
      const previous = this.history.get(entry.identity)!;
      this.history.set(entry.identity, { ...previous, last: now, next: now + 3000 });
    }
    this.active = null;
    this.next = now + 3000 + this.random() * 1000;
  }
  tick(now: number) {
    if (this.next < 0) this.next = now + 3000 + this.random() * 1000;
    if (this.active) { if (now >= this.active.until) this.end(now); return; }
    if (now < this.next) return;
    const eligible = [...this.entries.entries()].filter(([, e]) => e.enabled && now >= (this.history.get(e.identity)?.next ?? 0));
    if (!eligible.length) return;
    // Prefer agents that have waited longest, randomizing ties on first appearance.
    const earliest = Math.min(...eligible.map(([, e]) => this.history.get(e.identity)?.last ?? -1));
    const candidates = eligible.filter(([, e]) => (this.history.get(e.identity)?.last ?? -1) === earliest);
    const [key, entry] = candidates[Math.floor(this.random() * candidates.length)];
    const prior = this.history.get(entry.identity);
    const choices: AmbientAction[] = [...motionStyles, 'glance', 'blink', 'wink'];
    const options = choices.filter(a => a !== prior?.action);
    const action = prior ? options[Math.floor(this.random() * options.length)] : choices[avatarProfile(entry.identity).seed % choices.length];
    this.history.set(entry.identity, { action, last: now, next: now });
    this.active = { key, until: now + durations[action] };
    entry.start(action, durations[action]);
  }
}
export const avatarDirector = new AvatarDirector();

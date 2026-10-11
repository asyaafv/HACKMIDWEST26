/** A one-shot chime. A blocked context is never allowed to play the cue later. */
export function createEntranceAudio() {
  let context: AudioContext | undefined;
  let played = false;
  let disposed = false;
  const getContext = () => {
    if (disposed) return;
    try { context ??= new AudioContext(); return context; } catch { return; }
  };
  return {
    unlock() {
      if (played) return;
      const ctx = getContext();
      if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
    },
    play() {
      if (played || disposed) return;
      played = true;
      const ctx = getContext();
      if (!ctx || ctx.state !== 'running') return;
      [880, 1318.51].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        const start = ctx.currentTime + index * .085;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.055, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .55);
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(start); oscillator.stop(start + .58);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    },
    dispose() {
      disposed = true;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}

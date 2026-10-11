import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from '@phosphor-icons/react';
import { ENTRANCE_DURATION, entrancePose } from './entrance-timeline';
import { createEntranceAudio } from './entrance-audio';
import type { EntranceScene } from './entrance-scene';
import './gate-entrance.css';

// Memory-only: client routing never resets this, while a fresh document does.
let visitComplete = false;

const EntranceReplayContext = createContext<() => void>(() => {});
export const useEntranceReplay = () => useContext(EntranceReplayContext);

export function GateEntrance({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(!visitComplete);
  const [visit, setVisit] = useState(0);
  const [mode, setMode] = useState<'loading' | 'scene' | 'reduced' | 'fallback'>('loading');
  const workspace = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null), approval = useRef<HTMLDivElement>(null), skip = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const replay = useCallback(() => {
    visitComplete = false; setMode('loading'); setVisit(v => v + 1); setActive(true);
  }, []);

  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      replay();
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, [replay]);

  useEffect(() => {
    if (!active) return;
    const shell = workspace.current!, root = overlay.current!, button = skip.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Use the document element so an already-open transaction panel can own
    // its independent body scroll lock without inheriting the intro's lock.
    const previousOverflow = document.documentElement.style.overflow;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const audio = createEntranceAudio();
    let scene: EntranceScene | undefined, frame = 0, timer = 0, initTimer = 0;
    let cancelled = false, finished = false, fallback = false, started = 0, phase = '';
    let hasStarted = false;
    const initStarted = performance.now();
    document.documentElement.style.overflow = 'hidden';
    shell.inert = true;
    shell.style.filter = 'brightness(.3)';
    button.focus({ preventScroll: true });

    const release = () => {
      cancelAnimationFrame(frame); clearTimeout(timer); clearTimeout(initTimer);
      scene?.dispose(); scene = undefined; audio.dispose();
      shell.inert = false; shell.style.removeProperty('filter');
      document.documentElement.style.overflow = previousOverflow;
    };
    const finish = () => {
      if (cancelled || finished) return;
      finished = true; visitComplete = true;
      const restoreFocus = root.contains(document.activeElement);
      release(); setActive(false);
      if (restoreFocus) {
        const pendingDialog = shell.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]');
        const target = pendingDialog ?? (previousFocus && previousFocus !== document.body && previousFocus.isConnected && !root.contains(previousFocus) ? previousFocus : document.getElementById('main-content'));
        target?.focus({ preventScroll: true });
      }
    };
    finishRef.current = finish;
    const staticReveal = (kind: 'reduced' | 'fallback') => {
      if (cancelled || finished || fallback) return;
      fallback = true;
      cancelAnimationFrame(frame); clearTimeout(timer); clearTimeout(initTimer);
      scene?.dispose(); scene = undefined; audio.dispose();
      setMode(kind); root.dataset.phase = 'static';
      root.style.removeProperty('--intro-backdrop');
      timer = window.setTimeout(finish, 700);
    };
    const paint = () => {
      if (cancelled || finished || !scene) return;
      const elapsed = performance.now() - started, pose = entrancePose(elapsed);
      if (pose.done) { finish(); return; }
      if (document.hidden) return;
      if (phase !== pose.phase) { phase = pose.phase; root.dataset.phase = phase; }
      // If a hidden tab skips the approval beat, do not play its sound late.
      if (elapsed >= 2850 && elapsed < 3500) audio.play();
      approval.current!.style.opacity = String(pose.approval);
      approval.current!.style.transform = `translateY(${(1 - pose.approval) * 8}px)`;
      root.style.setProperty('--intro-backdrop', String(1 - pose.handoff));
      shell.style.filter = `brightness(${.3 + .7 * pose.handoff})`;
      try { scene.render(elapsed, pose); } catch { staticReveal('fallback'); return; }
      frame = requestAnimationFrame(paint);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && hasStarted && !fallback) paint();
    };
    const key = (event: KeyboardEvent) => {
      // Keep application-wide shortcuts from opening controls behind the intro.
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      else if (event.key === 'Tab') { event.preventDefault(); button.focus(); }
      else audio.unlock();
    };
    const unlock = () => audio.unlock();
    const resize = () => { scene?.resize(); };
    const reduced = () => { if (media.matches) staticReveal('reduced'); };
    const lost = (event: Event) => { event.preventDefault(); staticReveal('fallback'); };
    document.addEventListener('keydown', key, true);
    document.addEventListener('visibilitychange', visibility);
    root.addEventListener('pointerdown', unlock);
    window.addEventListener('resize', resize);
    media.addEventListener('change', reduced);
    const canvasElement = canvas.current!;
    canvasElement.addEventListener('webglcontextlost', lost);

    if (media.matches) staticReveal('reduced');
    else {
      initTimer = window.setTimeout(() => staticReveal('fallback'), 1000);
      void import('./entrance-scene').then(({ createEntranceScene }) => {
        if (cancelled || finished || fallback) return;
        try {
          scene = createEntranceScene(canvasElement);
          if (performance.now() - initStarted > 1000) { staticReveal('fallback'); return; }
          clearTimeout(initTimer); setMode('scene');
          started = performance.now(); hasStarted = true;
          timer = window.setTimeout(finish, ENTRANCE_DURATION);
          paint();
        } catch { staticReveal('fallback'); }
      }).catch(() => staticReveal('fallback'));
    }
    return () => {
      cancelled = true; release();
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('visibilitychange', visibility);
      root.removeEventListener('pointerdown', unlock);
      window.removeEventListener('resize', resize);
      media.removeEventListener('change', reduced);
      canvasElement.removeEventListener('webglcontextlost', lost);
    };
  }, [active, visit]);

  return <>
    <EntranceReplayContext.Provider value={replay}><div ref={workspace} className="entrance-workspace" inert={active}>{children}</div></EntranceReplayContext.Provider>
    {active && <div key={visit} ref={overlay} className="gate-entrance" data-mode={mode} role="dialog" aria-modal="true" aria-label="Welcome to Gate" aria-describedby="entrance-description">
      <p className="sr-only" id="entrance-description">A decorative welcome animation. No transaction is being approved. Press Escape or skip to enter the workspace.</p>
      <div className="entrance-backdrop" aria-hidden="true" />
      <canvas ref={canvas} className="entrance-canvas" aria-hidden="true" />
      <div className="entrance-static" aria-hidden="true"><img src="/assets/gate-logo.png" alt="" width="112" height="112" /><span>Welcome to Gate</span>{mode !== 'loading' && <Check size={24} weight="bold" />}</div>
      <div ref={approval} className="entrance-approval" aria-hidden="true"><span className="entrance-check"><Check size={26} weight="bold" /></span><span>Approved</span></div>
      <button ref={skip} type="button" className="entrance-skip" onClick={() => finishRef.current()}>Skip intro <span aria-hidden="true">Esc</span></button>
    </div>}
  </>;
}

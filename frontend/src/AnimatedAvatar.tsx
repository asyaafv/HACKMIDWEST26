import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play } from '@phosphor-icons/react';
import './animated-avatar.css';

import { avatarProfile, characterRig, seededRandom } from './avatar-profiles';
import { avatarDirector } from './avatar-director';
import { AvatarMotion, eyePath, type Expression } from './avatar-motion';
export type { Expression } from './avatar-motion';
const MOTION_AMPLITUDE = 1.5;
const expressions: { value: Expression; label: string }[] = [
  { value: 'idle', label: 'Look around' }, { value: 'left', label: 'Look left' },
  { value: 'right', label: 'Look right' }, { value: 'blink', label: 'Blink' },
  { value: 'wink', label: 'Wink' }, { value: 'closed', label: 'Close eyes' },
];

/** Character 01 rig. Coordinates match the supplied 1254px original. */
export function AnimatedAvatar({ size = 112, label = 'Gatekeeper', paused = false, selected = false, expression = 'idle', cue = 0, interactive = false, character = 1, identity = 'preview-red' }: {
  size?: number; label?: string; paused?: boolean; selected?: boolean; expression?: Expression; cue?: number; interactive?: boolean; character?: number; identity?: string;
}) {
  const id = useId().replace(/:/g, '');
  const rig = characterRig(character);
  const profile = avatarProfile(identity);
  const file = `/assets/characters/character_${String(character).padStart(2, '0')}`;
  const [plateReady, setPlateReady] = useState(false);
  useEffect(() => {
    const image = new Image();
    image.onload = () => setPlateReady(true);
    image.src = `${file}-clean-plate.png`;
    return () => { image.onload = null; };
  }, [file]);
  const lens = (cx: number, open: number) => eyePath(cx, open, rig.cy, rig.rx, rig.ry);
  const root = useRef<HTMLSpanElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const running = !paused && visible && !hidden && !reduced;
  const motion = useRef<AvatarMotion | null>(null);
  if (!motion.current) motion.current = new AvatarMotion(seededRandom(profile.seed));
  const suspended = paused || !visible || hidden;
  const bodyAnimation = useRef<Animation | null>(null);
  const paintRef = useRef<() => void>(() => {});
  useEffect(() => {
    motion.current!.command(expression, reduced);
    paintRef.current();
  }, [expression, cue, reduced]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(root.current!);
    const visibility = () => setHidden(document.hidden);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => setReduced(media.matches);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', preference);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', preference); };
  }, []);
  useEffect(() => {
    const node = svg.current!;
    const pupils = node.querySelectorAll<SVGGElement>('.rig-pupil');
    const apertures = node.querySelectorAll<SVGPathElement>('.rig-aperture');
    const outlines = node.querySelectorAll<SVGPathElement>('.rig-outline');
    const pair = node.querySelector<SVGGElement>('.rig-eye-pair')!;
    const state = motion.current!;
    let lastPose = '';
    const paint = () => {
      const pose = `${state.gaze.x.toFixed(3)},${state.gaze.y.toFixed(3)},${state.sway.x.toFixed(3)},${state.sway.y.toFixed(3)},${state.eyes}`;
      if (pose === lastPose) return;
      lastPose = pose;
      // Move the complete white eye and pupil together instead of sliding inside the ring.
      pupils.forEach(p => p.setAttribute('transform', character === 7 ? `translate(${(state.gaze.x * MOTION_AMPLITUDE).toFixed(3)} ${(state.gaze.y * MOTION_AMPLITUDE).toFixed(3)})` : 'translate(0 0)'));
      pair.setAttribute('transform', character === 7 ? 'translate(0 0)' : `translate(${((state.gaze.x + state.sway.x) * MOTION_AMPLITUDE).toFixed(3)} ${((state.gaze.y + state.sway.y) * MOTION_AMPLITUDE).toFixed(3)})`);
      apertures.forEach((path, i) => path.setAttribute('d', lens(rig.centers[i], state.eyes[i])));
      outlines.forEach((path, i) => {
        path.setAttribute('d', lens(rig.centers[i], state.eyes[i]));
        path.setAttribute('stroke-width', String(character === 7 ? 14 : 20 + 4 * state.eyes[i]));
        path.setAttribute('opacity', String(character === 7 ? 1 - state.eyes[i] : 1));
        path.setAttribute('data-openness', String(state.eyes[i]));
      });
    };
    paintRef.current = paint;
    paint();
    const unregister = avatarDirector.register(id, {
      identity, enabled: !suspended && !reduced && plateReady && expression === 'idle',
      start: (action, duration) => {
        root.current!.dataset.ambientActive = 'true';
        root.current!.dataset.action = action;
        if (action === 'glance' || action === 'left' || action === 'right' || action === 'blink' || action === 'wink' || action === 'rest-eyes') state.playAmbient(action);
        else {
          const distance = Math.min(4, size * .03) * MOTION_AMPLITUDE, drift = Math.min(3, size * .024) * MOTION_AMPLITUDE;
          const neutral = 'scale(.975)';
          const poses = action === 'drift' ? [neutral, `translate(${drift}px, ${-drift}px) scale(.975)`, `translate(${-drift}px, ${drift}px) scale(.975)`, neutral]
            : action === 'turn' ? [neutral, 'rotate(-4.5deg) scale(.975)', 'rotate(4.5deg) scale(.975)', neutral]
            : action === 'nod' ? [neutral, `translateY(${distance}px) scale(.975, .9525)`, neutral]
            : action === 'lean' ? [neutral, `translateX(${drift}px) rotate(3deg) scale(.975)`, neutral]
            : [neutral, 'scale(1.005)', neutral];
          bodyAnimation.current = node.animate(poses.map(transform => ({ transform, easing: 'ease-in-out' })), { duration, easing: 'linear', iterations: 1 });
        }
      },
      finish: () => {
        bodyAnimation.current?.cancel(); bodyAnimation.current = null;
        root.current?.setAttribute('data-ambient-active', 'false'); root.current?.setAttribute('data-action', 'rest');
        state.rest(); paint();
      },
    });
    if (suspended) return unregister;
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50); last = now;
      avatarDirector.tick(now);
      state.step(dt, pointer.current, reduced, false);
      paint(); frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); unregister(); };
  }, [suspended, reduced, character, plateReady, expression, identity, id, size]);
  return <span ref={root} className="animated-avatar avatar" data-running={running} data-selected={selected} data-ambient-active="false" data-action="rest" data-character={character} data-motion={profile.style} style={{ width: size, height: size, '--float-distance': `${Math.min(18, Math.max(4, size * .06)) * MOTION_AMPLITUDE}px` } as CSSProperties}
    onPointerMove={interactive ? e => { const r = e.currentTarget.getBoundingClientRect(); avatarDirector.setEnabled(id, false); pointer.current = { x: ((e.clientX - r.left) / r.width - .5) * 84, y: ((e.clientY - r.top) / r.height - .5) * 32 }; } : undefined}
    onPointerLeave={() => { pointer.current = null; avatarDirector.setEnabled(id, running && plateReady && expression === 'idle'); }}>
    <svg ref={svg} viewBox="0 0 1254 1254" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${id}-feather`}><stop offset="0.84" stopColor="white" /><stop offset="1" stopColor="black" /></radialGradient>
        <mask id={`${id}-repair`} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254"><rect width="1254" height="1254" fill="black" />{rig.centers.map(cx => <circle key={cx} cx={cx} cy={rig.cy} r="190" fill={`url(#${id}-feather)`} />)}</mask>
        {rig.centers.map((cx, i) => <clipPath key={i} id={`${id}-eye-${i}`}><path className="rig-aperture" d={lens(cx, 1)} /></clipPath>)}
      </defs>
      <image href={`${file}.png`} width="1254" height="1254" />
      <image href={`${file}-clean-plate.png`} opacity={plateReady ? 1 : 0} width="1254" height="1254" preserveAspectRatio="none" mask={`url(#${id}-repair)`} />
      <g className="rig-eye-pair" opacity={plateReady ? 1 : 0}>{rig.centers.map((cx, i) => <g key={i}>
        <g clipPath={`url(#${id}-eye-${i})`}>
          <g className="rig-pupil"><rect x={cx - 60} y={rig.cy - 92} width="120" height="194" rx="60" fill="#020202" /><rect x={cx - 23} y={rig.cy - 52} width="46" height="114" rx="23" fill="#fff" /></g>
        </g>
        <path className="rig-outline" d={lens(cx, 1)} stroke={character === 7 ? '#020202' : '#fff'} opacity={character === 7 ? 0 : 1} strokeWidth="24" fill="none" strokeLinecap="round" strokeLinejoin="round" data-openness="1" />
      </g>)}</g>
    </svg>
  </span>;
}

export function AnimationPreview() {
  const [character, setCharacter] = useState(1);
  const [expression, setExpression] = useState<Expression>('idle');
  const [cue, setCue] = useState(0);
  const [paused, setPaused] = useState(false);
  const [floating, setFloating] = useState(false);
  return <main className="page-main motion-preview">
    <div className="page-heading"><div><h1>A little more alive.</h1></div><Link className="button" to="/gatekeepers">Back to Gatekeepers</Link></div>
    <div className="motion-workbench">
      <div className="motion-stage"><AnimatedAvatar key={character} character={character} identity={`preview-${character}`} size={440} paused={paused} selected={floating} expression={expression} cue={cue} interactive label={`Character ${character} animation preview`} /></div>
      <section className="motion-controls" aria-label="Animation controls"><h2>Meet your Gatekeeper</h2><label className="character-select">Character<select aria-label="Character" value={character} onChange={e => { setCharacter(Number(e.target.value)); setExpression('idle'); }}>{Array.from({length: 10}, (_, i) => <option key={i} value={i + 1}>Character {i + 1}</option>)}</select></label>
        <button type="button" className={`button motion-float ${floating ? 'primary' : ''}`} aria-pressed={floating} onClick={() => setFloating(value => !value)}>Float</button>
        <div className="expression-controls">{expressions.map(e => <button type="button" className={`button ${expression === e.value ? 'primary' : ''}`} key={e.value} aria-pressed={expression === e.value} onClick={() => { setExpression(e.value); setCue(c => c + 1); }}>{e.label}</button>)}</div>
        <button type="button" className="button motion-pause" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={18} /> : <Pause size={18} />}{paused ? 'Resume animation' : 'Pause animation'}</button>
        <div className="motion-context"><h3>At dashboard size</h3><div><AnimatedAvatar key={character} character={character} identity={`preview-${character}`} size={112} paused={paused} selected={floating} expression={expression} cue={cue} /><span><strong>Character {character}</strong></span></div></div>
      </section>
    </div>
  </main>;
}

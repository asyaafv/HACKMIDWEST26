import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { CheckCircle, X, WarningCircle, ArrowRight, type Icon } from '@phosphor-icons/react';
import { useDemo } from './context';
import type { Decision, Gatekeeper, Merchant, Priority } from './types';
import { AnimatedAvatar } from './AnimatedAvatar';

export function Avatar({ agent, size = 72, selected = false }: { agent: Gatekeeper; size?: number; selected?: boolean }) {
  return <AnimatedAvatar key={`${agent.id}-${agent.avatar}`} character={agent.avatar} identity={agent.id} size={size} selected={selected} label={`${agent.name} character portrait`} paused={!agent.active} />;
}
export function MerchantImage({ merchant, size = 36 }: { merchant: Merchant; size?: number }) {
  return merchant.logo ? <img className={`merchant-image merchant-image-${merchant.id}`} src={merchant.logo} alt="" width={size} height={size} /> : <span className="merchant-space" style={{ width: size, height: size }} aria-hidden="true" />;
}
export function Status({ value, large = false }: { value: Decision; large?: boolean }) {
  return <span className={`status ${value.toLowerCase()} ${large ? 'status-large' : ''}`}>{large && value === 'Approved' && <CheckCircle size={22} weight="fill" />}{large && value === 'Blocked' && <WarningCircle size={22} />}{large ? value.toUpperCase() : value}</span>;
}
export function PriorityBadge({ value }: { value: Priority }) { return <span className={`priority ${value.toLowerCase()}`}>{value}</span>; }
export function Empty({ title }: { title: string }) { return <div className="empty"><h3>{title}</h3></div>; }
export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1></div>{action && <div className="page-action">{action}</div>}</div>;
}
export function IconButton({ label, icon: Glyph, onClick, disabled, className = '' }: { label: string; icon: Icon; onClick?: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}><Glyph size={20} /></button>;
}
export function Dialog({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const { error } = useDemo();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement;
    const node = ref.current!; node.showModal();
    return () => { node.close(); if (opener.current?.isConnected) opener.current.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby="dialog-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="dialog-heading"><div><h2 id="dialog-title">{title}</h2></div><IconButton icon={X} label="Close dialog" onClick={onClose} disabled={busy} /></div>
    {error && <ErrorMessage>{error}</ErrorMessage>}
    {children}
  </dialog>;
}
export function ErrorMessage({ children }: { children: ReactNode }) { return <p className="inline-error" role="alert"><WarningCircle size={18} />{children}</p>; }
export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) { return <button type="submit" className="button primary" disabled={busy}>{busy ? 'Saving…' : children}</button>; }
export function FormFooter({ onClose, busy, children }: { onClose: () => void; busy: boolean; children: ReactNode }) { return <div className="form-footer"><button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button><SubmitButton busy={busy}>{children}</SubmitButton></div>; }
export const preventSubmit = (e: FormEvent) => e.preventDefault();
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button type="button" className="text-link" onClick={onClick}>{children}<ArrowRight size={17} /></button>; }

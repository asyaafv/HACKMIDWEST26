/** Main Gate dashboard renders stored transaction records in the existing visual design. */
import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { HouseLine, ArrowsLeftRight, Users, ShieldCheck, ClipboardText, GearSix, MagnifyingGlass, CaretDown, X, List, WarningCircle, CheckCircle, IconContext } from '@phosphor-icons/react';
import { useDemo } from './context';
import { money } from './data';
import { IconButton } from './components';
import { AuditLog, Decisions, Gatekeepers, Overview, Policies, SettingsPage, Transactions } from './pages';
import { AnimationPreview } from './AnimatedAvatar';
import { useEntranceReplay } from './GateEntrance';
import { pendingRequests } from './decisions';

const navigation = [{ path: '/overview', label: 'Overview', icon: HouseLine }, { path: '/decisions', label: 'Needs a decision', icon: WarningCircle }, { path: '/transactions', label: 'Transactions', icon: ArrowsLeftRight }, { path: '/gatekeepers', label: 'Gatekeepers', icon: Users }, { path: '/policies', label: 'Policies', icon: ShieldCheck }, { path: '/audit-log', label: 'Audit log', icon: ClipboardText }];
export default function App() {
  const replayEntrance = useEntranceReplay();
  const { state, loading, error, notice, reload, dismiss } = useDemo();
  const [mobileNav, setMobileNav] = useState(false), [search, setSearch] = useState(''), [searchOpen, setSearchOpen] = useState(false), [workspaceOpen, setWorkspaceOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null), navRef = useRef<HTMLElement>(null), menuRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate(), location = useLocation();
  useEffect(() => { setMobileNav(false); setSearchOpen(false); setWorkspaceOpen(false); const label = location.pathname === '/animation-preview' ? 'Animation preview' : navigation.find(n => location.pathname.startsWith(n.path))?.label ?? 'Settings'; document.title = `Gate | ${label === 'Transactions' ? 'Authorization queue' : label}`; }, [location]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); setSearchOpen(true); } if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { setSearchOpen(false); setWorkspaceOpen(false); setMobileNav(false); } };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    const first = navRef.current?.querySelector<HTMLElement>('a'); first?.focus();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const handle = (e: KeyboardEvent) => { if (e.key !== 'Tab') return; const nodes = navRef.current?.querySelectorAll<HTMLElement>('a,button'); if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } };
    document.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', handle); menuRef.current?.focus(); };
  }, [mobileNav]);
  const merchants = state?.merchants ?? [];
  const pendingCount = state ? pendingRequests(state.transactions).length : 0;
  const resultTransactions = state?.transactions.filter(t => `${t.id} ${merchants.find(m => m.id === t.merchantId)!.name} ${state.agents.find(a => a.id === t.agentId)!.name}`.toLowerCase().includes(search.toLowerCase())).slice(0, 5) ?? [];
  const resultAgents = state?.agents.filter(a => `${a.name} ${a.description}`.toLowerCase().includes(search.toLowerCase())).slice(0, 3) ?? [];
  return <IconContext.Provider value={{ weight: 'regular' }}><div className={`app ${state?.settings.compact ? 'compact' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    {mobileNav && <div className="nav-backdrop" aria-hidden="true" onClick={() => setMobileNav(false)} />}
    <aside ref={navRef} className={`sidebar ${mobileNav ? 'mobile-open' : ''}`} aria-label="Workspace navigation"><NavLink to="/overview" className="brand" aria-label="Gate home and replay intro" title="Replay intro" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) replayEntrance(); }}><img src="/assets/gate-logo.png" alt="" width={44} height={44} /><span>Gate</span></NavLink><button type="button" className="mobile-nav-close icon-button" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={22} /></button>
      <nav aria-label="Main navigation">{navigation.map(({ path, label, icon: Glyph }) => <NavLink key={path} to={path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Glyph size={25} /><span>{label}</span>{path === '/decisions' && pendingCount > 0 && <span className="decision-nav-count" aria-label={`${pendingCount} pending requests`}>{pendingCount}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><NavLink to="/settings" className={({ isActive }) => `nav-item settings-nav ${isActive ? 'active' : ''}`}><GearSix size={25} /><span>Settings</span></NavLink><div className="workspace-control"><button type="button" className="workspace-button" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen(!workspaceOpen)}><span className="workspace-monogram">{state?.settings.workspace.slice(0, 1).toUpperCase() ?? 'A'}</span><span><strong>{state?.settings.workspace ?? 'Gate workspace'}</strong></span><CaretDown size={17} /></button>{workspaceOpen && <div className="workspace-popover"><strong>{state?.settings.workspace ?? 'Gate workspace'}</strong><p>PostgreSQL, USD</p><button type="button" onClick={() => navigate('/settings')}>Workspace settings</button></div>}</div></div>
    </aside>
    <header className="topbar"><button ref={menuRef} type="button" className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><List size={23} /></button><div className="global-search"><form onSubmit={e => { e.preventDefault(); if (search.trim()) navigate(`/transactions?search=${encodeURIComponent(search.trim())}&request=none`); setSearchOpen(false); }}><MagnifyingGlass size={23} /><input ref={searchRef} value={search} onChange={e => { setSearch(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onBlur={() => { window.setTimeout(() => { if (!document.activeElement?.closest('.global-search')) setSearchOpen(false); }, 100); }} placeholder="Search transactions, agents, merchants, or request IDs…" aria-label="Search transactions, agents, merchants, or request IDs" aria-expanded={searchOpen && !!search.trim()} aria-controls="global-search-results" /><kbd>⌘ K</kbd></form>{searchOpen && search.trim() && <div className="search-results" id="global-search-results"><h3>Transactions</h3>{resultTransactions.length ? resultTransactions.map(t => <button type="button" key={t.id} onClick={() => { navigate(`/transactions?request=${t.id}`); setSearchOpen(false); }}><span><strong>{merchants.find(m => m.id === t.merchantId)!.name}</strong><small>{t.id}, {state!.agents.find(a => a.id === t.agentId)!.name}</small></span><span>{money(t.amount)}</span></button>) : <p>No matching transactions</p>}<h3>Gatekeepers</h3>{resultAgents.length ? resultAgents.map(a => <button type="button" key={a.id} onClick={() => { navigate(`/gatekeepers?search=${encodeURIComponent(a.name)}`); setSearchOpen(false); }}><span><strong>{a.name}</strong><small>{a.department}</small></span></button>) : <p>No matching Gatekeepers</p>}</div>}</div><NavLink to="/settings" className="profile" aria-label="Open profile settings">{state?.settings.initials ?? 'JD'}</NavLink></header>
    <div id="main-content" className="app-content" tabIndex={-1}>{loading ? <main className="loading-screen" aria-busy="true"><div className="skeleton skeleton-title" />{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton skeleton-row" />)}<span className="sr-only">Loading backend records…</span></main> : state ? <Routes><Route path="/" element={<Navigate to="/overview" replace />} /><Route path="/overview" element={<Overview />} /><Route path="/decisions" element={<Decisions />} /><Route path="/transactions" element={<Transactions />} /><Route path="/gatekeepers" element={<Gatekeepers />} /><Route path="/animation-preview" element={<AnimationPreview />} /><Route path="/policies" element={<Policies />} /><Route path="/audit-log" element={<AuditLog />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/overview" replace />} /></Routes> : <main className="load-error"><WarningCircle size={38} /><h1>The backend couldn’t load</h1><p>{error}</p><div><button type="button" className="button" onClick={reload}>Try again</button></div></main>}</div>
    {error && state && <div className="error-toast" role="alert"><WarningCircle size={21} /><span>{error}</span><IconButton icon={X} label="Dismiss error" onClick={dismiss} /></div>}{notice && state?.settings.notifications && <div className="success-toast" role="status"><CheckCircle size={21} /><span>{notice}</span><IconButton icon={X} label="Dismiss notification" onClick={dismiss} /></div>}

  </div></IconContext.Provider>;
}

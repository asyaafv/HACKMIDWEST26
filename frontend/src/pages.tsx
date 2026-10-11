/** Existing dashboard pages read PostgreSQL-backed state and preserve the supplied visual layout. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarBlank, CaretDown, CaretRight, Plus, MagnifyingGlass, PencilSimple, Pause, Play, CheckCircle, ShieldCheck, WarningCircle, Funnel, ClockCounterClockwise } from '@phosphor-icons/react';
import { useDemo } from './context';
import { ago, dateLabel, money } from './data';
import { Avatar, Dialog, Empty, IconButton, MerchantImage, PageTitle, PriorityBadge, Status, TextLink } from './components';
import { RequestForm } from './forms';
import { pendingRequests } from './decisions';
import { investigationLabels } from './InvestigationPanel';
import { TransactionPanel } from './TransactionPanel';
import type { Decision, Transaction } from './types';

export function TransactionTable({ records, selectedId, onSelect }: { records: Transaction[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { state } = useDemo(); const merchants = state!.merchants ?? [];
  return <div className="table-scroll"><table className="transaction-table"><colgroup><col className="col-agent" /><col className="col-merchant" /><col className="col-amount" /><col className="col-priority" /><col className="col-decision" /><col className="col-risk" /><col className="col-time" /><col className="col-open" /></colgroup><thead><tr><th>Agent</th><th>Merchant</th><th className="amount-cell">Amount</th><th>Priority</th><th>Decision</th><th>Risk</th><th>Time</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{records.map(t => {
    const agent = state!.agents.find(a => a.id === t.agentId)!, merchant = merchants.find(m => m.id === t.merchantId)!;
    return <tr key={t.id} className={selectedId === t.id ? 'selected' : ''} onClick={() => onSelect(t.id)}><td><div className="entity"><Avatar agent={agent} selected={selectedId === t.id} /><div><strong>{agent.name}</strong><span>{t.investigation?investigationLabels[t.investigation.status]:agent.department}</span></div></div></td><td><div className="entity"><MerchantImage merchant={merchant} /><div><strong>{merchant.name}</strong><span>{merchant.category}</span></div></div></td><td className="amount-cell"><strong>{money(t.amount)}</strong><span>USD</span></td><td><PriorityBadge value={t.priority} /></td><td><Status value={t.decision} /></td><td><span className={`risk ${t.risk >= 70 ? 'risk-high' : t.risk >= 40 ? 'risk-review' : t.risk <= 10 ? 'risk-low' : ''}`}>{t.risk}</span></td><td className="time-cell">{ago(t.createdAt)}</td><td><button type="button" className="row-open" aria-label={`Open ${t.id} ${merchant.name}`} aria-expanded={selectedId === t.id} onClick={e => { e.stopPropagation(); onSelect(t.id); }}><CaretRight size={19} /></button></td></tr>;
  })}</tbody></table></div>;
}

export function Transactions() {
  const { state } = useDemo(); const merchants = state!.merchants ?? []; const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Decision | 'All'>('All'), [days, setDays] = useState(0), [create, setCreate] = useState(false);
  const query = (params.get('search') ?? '').toLowerCase(); const tab = params.get('tab') === 'requests' ? 'Requests' : 'Transactions';
  const selectedId = params.get('request') ?? 'none';
  useEffect(() => { setFilter('All'); }, [query]);
  const choose = useCallback((id: string) => setParams(current => { const next = new URLSearchParams(current); next.set('request', id); return next; }), [setParams]);
  const close = useCallback(() => choose('none'), [choose]);
  const records = useMemo(() => state!.transactions.filter(t => {
    const a = state!.agents.find(a => a.id === t.agentId)!, m = merchants.find(m => m.id === t.merchantId)!;
    return (days === 0 || Date.now() - Date.parse(t.createdAt) <= days * 86400000) && `${t.id} ${a.name} ${a.department} ${m.name} ${t.purpose}`.toLowerCase().includes(query);
  }), [state, days, query]);
  const visible = records.filter(t => filter === 'All' || t.decision === filter);
  const selected = state!.transactions.find(t => t.id === selectedId);
  const index = visible.findIndex(t => t.id === selectedId);
  return <div className={`transaction-workspace ${selected ? 'with-detail' : ''}`}><main className="queue-main"><PageTitle title="Authorization queue" />
    <div className="queue-tabs" aria-label="Queue view">{['Transactions', 'Requests'].map(name => <button type="button" key={name} className={tab === name ? 'active' : ''} aria-pressed={tab === name} onClick={() => setParams(current => { const next = new URLSearchParams(current); if (name === 'Requests') next.set('tab', 'requests'); else next.delete('tab'); return next; })}>{name}</button>)}{tab === 'Requests' && state!.identity?.capabilities.includes('request:submit') && <button type="button" className="button primary new-request" disabled={!state!.identity?.capabilities.includes('request:submit')} onClick={() => setCreate(true)}><Plus size={17} />Create request</button>}</div>
    <div className="queue-toolbar"><div className="status-filters">{(['All', 'Pending', 'Approved', 'Blocked'] as const).map(name => <button type="button" key={name} aria-pressed={filter === name} className={`filter-button ${filter === name ? 'active' : ''}`} onClick={() => setFilter(name)}>{name}<span className="count">{name === 'All' ? records.length : records.filter(t => t.decision === name).length}</span></button>)}</div><label className="date-filter"><CalendarBlank size={19} /><select aria-label="Date range" value={days} onChange={e => setDays(Number(e.target.value))}><option value={0}>All loaded records</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><CaretDown size={16} /></label></div>
    {query && <div className="search-summary">Results for “{params.get('search')}”<button type="button" className="text-link" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.delete('search'); return next; })}>Clear search</button></div>}
    {visible.length ? <TransactionTable records={visible} selectedId={selectedId} onSelect={choose} /> : <Empty title="No matching transactions" />}
    <p className="table-footer">{visible.length} {tab.toLowerCase()}, USD</p>
  </main>{selected && <TransactionPanel transaction={selected} onClose={close} onPrevious={() => { if (index > 0) choose(visible[index - 1].id); }} onNext={() => { if (index >= 0 && index < visible.length - 1) choose(visible[index + 1].id); }} hasPrevious={index > 0} hasNext={index >= 0 && index < visible.length - 1} />}{create && <RequestForm onClose={() => setCreate(false)} onCreated={id => { setFilter('All'); choose(id); }} />}</div>;
}

export function Decisions() {
  const { state } = useDemo();
  const [params, setParams] = useSearchParams();
  const [confirmation, setConfirmation] = useState('');
  const completionRef = useRef<HTMLDivElement>(null);
  const pending = pendingRequests(state!.transactions);
  const selectedId = params.get('request');
  const selected = pending.find(t => t.id === selectedId);
  const stale = selectedId ? state!.transactions.find(t => t.id === selectedId && t.decision !== 'Pending') : undefined;
  const index = pending.findIndex(t => t.id === selectedId);
  const choose = useCallback((id?: string) => setParams(id ? { request: id } : {}), [setParams]);
  const close = useCallback(() => choose(), [choose]);
  useEffect(() => { if (confirmation && !pending.length) completionRef.current?.focus(); }, [confirmation, pending.length]);
  const saved = (decision: 'Approved' | 'Blocked') => {
    const remaining = pending.filter(t => t.id !== selectedId);
    const next = pending[index + 1] ?? remaining[0];
    setConfirmation(`${selectedId} ${decision.toLowerCase()}. ${next ? 'Next pending request opened.' : 'All requests have been reviewed.'}`);
    choose(next?.id);
  };
  return <div className={`transaction-workspace ${selected ? 'with-detail' : ''}`}><main className="queue-main">
    <PageTitle title="Needs a decision" action={pending.length && !selected ? <button type="button" className="button primary" onClick={() => choose(pending[0].id)}>Review next request<ArrowRight size={18} /></button> : undefined} />
    <p className="decision-confirmation" role="status" aria-live="polite" aria-atomic="true">{confirmation}</p>
    {selectedId && !selected && <div className="decision-link-notice"><WarningCircle size={22} aria-hidden="true" /><div><p>{stale ? `${stale.id} has already been ${stale.decision.toLowerCase()}.` : 'This request is no longer available in the decision inbox.'}</p><div className="decision-link-actions">{pending.length > 0 && <button type="button" className="text-link" onClick={() => choose(pending[0].id)}>Review next request<ArrowRight size={17} /></button>}{stale && <Link className="text-link" to={`/transactions?request=${stale.id}`}>View transaction details<ArrowRight size={17} /></Link>}</div></div></div>}
    {pending.length ? <><div className="decision-inbox-summary"><span><strong>{pending.length}</strong> pending {pending.length === 1 ? 'request' : 'requests'}, {money(pending.reduce((sum, t) => sum + t.amount, 0))} USD</span></div><TransactionTable records={pending} selectedId={selectedId ?? undefined} onSelect={choose} /></> : <div className="decision-completion" ref={completionRef} tabIndex={-1}><CheckCircle size={36} aria-hidden="true" /><h2>You’re all caught up</h2><Link className="button primary" to="/overview">Back to overview<ArrowRight size={18} /></Link></div>}
  </main>{selected && <TransactionPanel key={selected.id} transaction={selected} onClose={close} onPrevious={() => choose(pending[index - 1]?.id)} onNext={() => choose(pending[index + 1]?.id)} hasPrevious={index > 0} hasNext={index < pending.length - 1} onDecisionSaved={saved} />}</div>;
}

export function Gatekeepers() {
  const { state, busy } = useDemo(); const navigate = useNavigate(); const [simulate,setSimulate] = useState(false); const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('search') ?? ''), [status, setStatus] = useState('All'), [viewingId, setViewingId] = useState<string | null>(null);
  useEffect(() => { setQuery(params.get('search') ?? ''); }, [params]);
  const agents = state!.agents.filter(a => `${a.name} ${a.description} ${a.department}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All' || (status === 'Active' ? a.active : !a.active)));
  const viewing = state!.agents.find(a => a.id === viewingId);
  return <main className="page-main"><PageTitle title="Gatekeepers" action={<button type="button" className="button primary" disabled={busy} onClick={()=>setSimulate(true)}><Plus size={18} />Simulate purchase</button>} />
    <p className="animation-preview-link"><Link className="text-link" to="/animation-preview">Try the animated character<ArrowRight size={17} /></Link></p><div className="page-toolbar"><label className="local-search"><MagnifyingGlass size={19} /><input aria-label="Search Gatekeepers" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Gatekeepers…" /></label><div className="segmented">{['All', 'Active', 'Paused'].map(s => <button key={s} type="button" className={status === s ? 'active' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>{s}<span className="count">{state!.agents.filter(a => s === 'All' || (s === 'Active' ? a.active : !a.active)).length}</span></button>)}</div></div>
    {agents.length ? <div className="gatekeeper-grid">{agents.map(a => <article className="gatekeeper-card" key={a.id}><button type="button" className="gatekeeper-open" aria-label={`Open ${a.name}`} title={`Open ${a.name}`} disabled={busy} onClick={() => setViewingId(a.id)}><span className="sr-only">Open {a.name}</span></button><div className="gatekeeper-portrait"><Avatar agent={a} size={160} /><span className={`agent-state ${a.active ? 'active' : 'paused'}`}>{a.active ? 'Active' : 'Paused'}</span></div><h2>{a.name}</h2><p className="department">{a.department}</p><p className="agent-description">{a.description}</p><div className="gatekeeper-bottom"><span>{state!.transactions.filter(t => t.agentId === a.id).length} requests</span><div><IconButton icon={PencilSimple} label={`Edit ${a.name}`} disabled /><IconButton icon={a.active ? Pause : Play} label={`${a.active ? 'Pause' : 'Resume'} ${a.name}`} disabled /></div></div></article>)}</div> : <Empty title="No matching Gatekeepers" />}
    {simulate && <RequestForm simulation onClose={()=>setSimulate(false)} onCreated={id=>navigate(`/transactions?request=${id}`)} />}
    {viewing && <Dialog title={viewing.name} onClose={() => setViewingId(null)}>
      <Avatar agent={viewing} size={112} />
      <p className="section-intro">{viewing.description}</p>
      <div className="source-content"><dl><dt>Department</dt><dd>{viewing.department}</dd><dt>Status</dt><dd>{viewing.active ? 'Active' : 'Paused'}</dd><dt>Agent ID</dt><dd>{viewing.id}</dd><dt>Requests</dt><dd>{state!.transactions.filter(t => t.agentId === viewing.id).length} in the loaded window</dd></dl></div>
      <div className="form-footer"><button type="button" className="button" onClick={() => setViewingId(null)}>Close</button><Link className="button primary" to={`/transactions?search=${encodeURIComponent(viewing.name)}&request=none`} onClick={() => setViewingId(null)}>View requests<ArrowRight size={17} /></Link></div>
    </Dialog>}
  </main>;
}

export function Overview() {
  const { state } = useDemo(), navigate = useNavigate(); const merchants = state!.merchants ?? []; const [create, setCreate] = useState(false);
  const transactions = state!.transactions, approved = transactions.filter(t => t.decision === 'Approved'), pending = pendingRequests(transactions), blocked = transactions.filter(t => t.decision === 'Blocked');
  const open = (id: string) => navigate(`/transactions?request=${id}`);
  return <main className="page-main"><PageTitle title="Workspace overview" action={<button type="button" className="button primary" disabled={!state!.identity?.capabilities.includes('request:submit')} onClick={() => setCreate(true)}><Plus size={18} />Create request</button>} />
    <section className={`decision-summary ${pending.length ? 'needs-attention' : 'caught-up'}`} aria-labelledby="decision-summary-title">
      {pending.length ? <>
        <div className="decision-summary-header"><div className="decision-summary-title"><WarningCircle size={28} aria-hidden="true" /><div><h2 id="decision-summary-title">{pending.length} {pending.length === 1 ? 'request needs' : 'requests need'} your decision</h2></div></div><button type="button" className="button primary" onClick={() => navigate(`/decisions?request=${pending[0].id}`)}>Review next request<ArrowRight size={18} /></button></div>
        <div className="decision-preview">{pending.slice(0, 3).map(t => {
          const merchant = merchants.find(m => m.id === t.merchantId)!, agent = state!.agents.find(a => a.id === t.agentId)!;
          return <div className="decision-preview-row" key={t.id}><div className="decision-preview-identity"><strong>{merchant.name}</strong><small>{agent.name}, {t.id}</small></div><PriorityBadge value={t.priority} /><span className="decision-wait">Waiting {ago(t.createdAt).replace('Just now', 'less than a minute').replace(' ago', '')}</span><strong className="decision-amount">{money(t.amount)}</strong><button type="button" className="button" aria-label={`Review ${t.id} ${merchant.name}`} onClick={() => navigate(`/decisions?request=${t.id}`)}>Review<CaretRight size={16} /></button></div>;
        })}</div>
        <div className="decision-summary-footer"><TextLink onClick={() => navigate('/decisions')}>View loaded {pending.length}</TextLink></div>
      </> : <div className="decision-summary-title"><CheckCircle size={25} aria-hidden="true" /><div><h2 id="decision-summary-title">You’re all caught up</h2></div></div>}
    </section>
    <div className="overview-metrics"><div><span>Approved request value</span><strong>{money(approved.reduce((sum, t) => sum + t.amount, 0))}</strong></div><div><span>Pending review</span><strong>{pending.length}</strong></div><div><span>Blocked requests</span><strong>{blocked.length}</strong></div><div><span>Active Gatekeepers</span><strong>{state!.agents.filter(a => a.active).length}</strong></div></div>
    <section className="overview-section"><div className="section-heading"><h2>Recent transactions</h2><TextLink onClick={() => navigate('/transactions')}>View all</TextLink></div><TransactionTable records={transactions.slice(0, 6)} onSelect={open} /></section>
    <section className="overview-section overview-activity"><div className="section-heading"><h2>Recent activity</h2><TextLink onClick={() => navigate('/audit-log')}>Audit log</TextLink></div>{state!.events.slice(0, 4).map(e => <div className="activity-row" key={e.id}><ClockCounterClockwise size={19} /><div>{e.transactionId ? <button type="button" className="plain-link" onClick={() => open(e.transactionId!)}>{e.title}</button> : <strong>{e.title}</strong>}<small>{e.actor}, {ago(e.createdAt)}</small></div></div>)}</section>
    {create && <RequestForm onClose={() => setCreate(false)} onCreated={open} />}
  </main>;
}

/** Policies are server-owned snapshots; no local editor invents published backend rules. */
export function Policies() {
  const { state } = useDemo();
  return <main className="page-main"><PageTitle title="Policies"/><section className="settings-section"><div><h2>Current policy</h2></div><div>{Object.entries(state!.catalog?.policy ?? {}).map(([key,value])=><div className="readonly-setting" key={key}><span>{key.replace(/([A-Z])/g,' $1')}</span><strong>{String(value)}</strong></div>)}</div></section><section className="settings-section"><div><h2>Project budgets</h2></div><div>{state!.catalog?.budgets.map(b=><div key={b.project_id}><h3>{state!.catalog!.projects.find(p=>p.id===b.project_id)?.name ?? b.project_id}</h3><p>Available {money(Number(BigInt(b.limit_minor)-BigInt(b.spent_minor)-BigInt(b.reserved_minor)),true)}, Held {money(Number(b.reserved_minor),true)}, Spent {money(Number(b.spent_minor),true)}</p></div>)}</div></section></main>;
}

export function AuditLog() {
  const { state } = useDemo(), navigate = useNavigate(); const [query, setQuery] = useState(''), [type, setType] = useState('all'), [days, setDays] = useState(30);
  const events = state!.events.filter(e => (type === 'all' || e.type === type) && Date.now() - Date.parse(e.createdAt) <= days * 86400000 && `${e.title} ${e.detail.replaceAll(', ', ', ')} ${e.actor}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="page-main"><PageTitle title="Audit log" /><div className="page-toolbar"><label className="local-search"><MagnifyingGlass size={19} /><input aria-label="Search Audit log" placeholder="Search requests, Gatekeepers, or activity…" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="audit-filters"><label className="select-with-icon"><Funnel size={18} /><select aria-label="Event type" value={type} onChange={e => setType(e.target.value)}><option value="all">All events</option><option value="request">Requests</option><option value="decision">Decisions</option><option value="gatekeeper">Gatekeepers</option><option value="policy">Policies</option><option value="settings">Settings</option></select></label><label className="date-filter"><CalendarBlank size={19} /><select aria-label="Audit date range" value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><CaretDown size={16} /></label></div></div>
    {events.length ? <div className="audit-timeline">{events.map(e => <article className="audit-event" key={e.id}><div className="audit-event-icon">{e.type === 'decision' ? <CheckCircle size={23} /> : e.type === 'policy' ? <ShieldCheck size={23} /> : <ClockCounterClockwise size={23} />}</div><div><h2>{e.transactionId ? <button type="button" className="plain-link" onClick={() => navigate(`/transactions?request=${e.transactionId}`)}>{e.title}<ArrowRight size={17} /></button> : e.agentId ? <button type="button" className="plain-link" onClick={() => navigate(`/gatekeepers?search=${encodeURIComponent(state!.agents.find(a => a.id === e.agentId)?.name ?? '')}`)}>{e.title}<ArrowRight size={17} /></button> : e.title}</h2><p>{e.detail.replaceAll(', ', ', ')}</p><small>{e.actor}</small></div><time dateTime={e.createdAt} title={dateLabel(e.createdAt)}>{ago(e.createdAt)}<span>{dateLabel(e.createdAt)}</span></time></article>)}</div> : <Empty title="No matching activity" />}
  </main>;
}

/** Server identity is read-only; presentation preferences change only this connected view. */
export function SettingsPage() {
  const { state } = useDemo();
  return <main className="page-main settings-page"><PageTitle title="Settings"/><section className="settings-section"><div><h2>Identity</h2></div><div>{Object.entries(state!.identity ?? {}).map(([key,value])=><div className="readonly-setting" key={key}><span>{key}</span><strong>{Array.isArray(value)?value.join(', '):String(value)}</strong></div>)}</div></section></main>;
}

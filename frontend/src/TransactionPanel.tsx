/** Transaction detail displays real source content, backend checks, and version-bound enterprise review. */
import { useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight, X, Copy, Check, CheckCircle, XCircle, FileText, Users, ChartBar, ShieldCheck } from '@phosphor-icons/react';
import { useDemo } from './context';
import { ago, dateLabel, money } from './data';
import { Dialog, ErrorMessage, IconButton, MerchantImage, PriorityBadge, Status } from './components';
import { InvestigationPanel } from './InvestigationPanel';
import { ReviewDialog } from './ReviewDialog';
import { DecisionValidation } from './DecisionValidation';
import type { Evidence, Transaction } from './types';

const evidenceIcons = { vendor: ShieldCheck, request: FileText, project: Users, budget: ChartBar, purpose: FileText };
export function TransactionPanel({ transaction, onClose, onPrevious, onNext, hasPrevious, hasNext, onDecisionSaved }: { transaction: Transaction; onClose: () => void; onPrevious: () => void; onNext: () => void; hasPrevious: boolean; hasNext: boolean; onDecisionSaved?: (decision: 'Approved' | 'Blocked') => void }) {
  const { state, busy } = useDemo();
  const [tab, setTab] = useState('Overview'), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(''), [source, setSource] = useState<Evidence | null>(null), [decision, setDecision] = useState<'Approved' | 'Blocked' | null>(null);
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [overlay, setOverlay] = useState(() => window.matchMedia('(max-width: 1535px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1535px)');
    const update = () => setOverlay(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { setTab('Overview'); setCopied(false); setCopyError(''); panel.current?.scrollTo(0, 0); }, [transaction.id]);
  useEffect(() => {
    if (!overlay) return;
    const opener = document.activeElement as HTMLElement;
    panel.current?.focus();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const handle = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', handle); if (opener.isConnected) opener.focus(); };
  }, [overlay]);
  if (!state) return null;
  const agent = state.agents.find(a => a.id === transaction.agentId)!;
  const merchants = state.merchants ?? [];
  const merchant = merchants.find(m => m.id === transaction.merchantId)!;
  const events = state.events.filter(e => e.transactionId === transaction.id);
  const copy = async () => {
    try { await navigator.clipboard.writeText(transaction.id); setCopied(true); setCopyError(''); }
    catch { setCopyError('Clipboard unavailable. Select and copy the request ID.'); }
  };
  const tabs = ['Overview', 'Evidence', 'Policies', 'Audit log'];
  return <>
    <div className="detail-backdrop" onClick={onClose} aria-hidden="true" />
    <aside className="detail-panel" ref={panel} tabIndex={-1} role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label={`${merchant.name} transaction details`}>
      <div className="panel-controls"><IconButton icon={X} label="Close transaction details" onClick={onClose} /><div><IconButton icon={CaretLeft} label="Previous transaction" onClick={onPrevious} disabled={!hasPrevious} /><IconButton icon={CaretRight} label="Next transaction" onClick={onNext} disabled={!hasNext} /></div></div>
      <div className="merchant-header"><MerchantImage merchant={merchant} size={48} /><div className="merchant-title"><h2>{merchant.name}</h2><p><span>{merchant.category}</span><span>{merchant.domain}</span></p></div><div className="request-meta"><span>{ago(transaction.createdAt)}</span><button type="button" onClick={copy} title="Copy request ID">{transaction.id}{copied ? <Check size={15} /> : <Copy size={15} />}</button></div></div>
      <div className="amount-header"><div><strong>{money(transaction.amount)}</strong><span>USD</span></div><Status value={transaction.decision} large /></div>
      {copyError && <ErrorMessage>{copyError}</ErrorMessage>}
      <span className="sr-only" role="status">{copied ? 'Request ID copied.' : ''}</span>
      <div className="panel-tabs" role="tablist" aria-label="Transaction sections">{tabs.map((name, i) => <button type="button" id={`panel-tab-${i}`} key={name} role="tab" aria-selected={tab === name} aria-controls="transaction-section" tabIndex={tab === name ? 0 : -1} className={tab === name ? 'active' : ''} onClick={() => setTab(name)} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const index = e.key === 'Home' ? 0 : e.key === 'End' ? 3 : (i + (e.key === 'ArrowRight' ? 1 : -1) + 4) % 4; setTab(tabs[index]); document.getElementById(`panel-tab-${index}`)?.focus(); }}>{name}{name === 'Evidence' && <span className="count">{transaction.evidence.length}</span>}{name === 'Policies' && <span className="count">{transaction.checks.length}</span>}</button>)}</div>
      <div id="transaction-section" className="panel-body" role="tabpanel" aria-labelledby={`panel-tab-${tabs.indexOf(tab)}`}>
        {tab === 'Overview' && <>
          {transaction.simulated && <p className="demo-note">Simulated purchase proposal · imported synthetic context. Payments use the local sandbox provider.</p>}
          <section className="transaction-details"><h3>Transaction details</h3><dl><dt>Agent</dt><dd>{agent.name}</dd><dt>Project</dt><dd>{transaction.project}</dd><dt>Merchant</dt><dd>{merchant.name}</dd><dt>Category</dt><dd>{transaction.category?.replaceAll('_',' ')??'Not recorded'}</dd><dt>Amount</dt><dd>{money(transaction.amount,true)} USD</dd><dt>Purpose</dt><dd>{transaction.purpose}</dd><dt>Source record</dt><dd>{transaction.source?`${transaction.source.domain.toUpperCase()} · ${transaction.source.sourceId}`:'Not recorded'}</dd><dt>Request ID</dt><dd>{transaction.id}</dd><dt>Date</dt><dd>{dateLabel(transaction.createdAt)}</dd><dt>Payment method</dt><dd>{transaction.paymentMethod}</dd><dt>Priority</dt><dd><PriorityBadge value={transaction.priority} /></dd></dl></section>
          {transaction.investigation && <InvestigationPanel transaction={transaction} />}
          {transaction.riskAssessment&&<p className="demo-note">Backend recommendation: {transaction.policyVerdict} · {transaction.riskAssessment.summary}</p>}
          {transaction.reviewBinding&&<DecisionValidation key={`${transaction.id}:${transaction.reviewBinding.version}`} transaction={transaction}/>}
          <section className="transaction-details"><h3>{transaction.investigation && transaction.investigation.status!=='EVALUATED' ? 'Initial policy check' : 'Backend evaluation'}</h3><dl><dt>Workflow</dt><dd>{transaction.workflowStatus}</dd><dt>Policy verdict</dt><dd>{transaction.policyVerdict}</dd><dt>Review state</dt><dd>{transaction.authorizationStatus}</dd><dt>Risk points</dt><dd>{transaction.risk} / 100, deterministic factors</dd><dt>Policy version</dt><dd>{transaction.analysis?.policyVersion}</dd></dl>{transaction.analysis?.factors.map(f=><p key={f.code}>{f.code.replaceAll('_',' ')}: +{f.points} points</p>)}{transaction.analysis?.missing.map(m=><p key={m}>Missing evidence: {m.replaceAll('_',' ')}</p>)}{transaction.reviewRequirements?.map(r=><p key={r.code}>Review required: {r.code.replaceAll('_',' ')}</p>)}</section>
          <section className="business-evidence"><h3>Business evidence</h3><div className="evidence-chain">{transaction.evidence.slice(0, 4).map(e => { const Glyph = evidenceIcons[e.kind]; return <button type="button" className="evidence-row" key={e.id} onClick={() => setSource(e)}><span className={`evidence-icon${e.kind === 'vendor' && !merchant.logo ? ' artwork-pending' : ''}`}>{e.kind === 'vendor' ? <MerchantImage merchant={merchant} size={27} /> : <Glyph size={25} />}</span><span><strong>{e.title}</strong><small>{e.subtitle}</small></span><CheckCircle size={22} className={e.kind === 'vendor' && !transaction.checks[0].passed ? 'muted' : 'success-text'} /></button>; })}</div></section>
          <section className="policy-checks"><h3>Policy checks</h3>{transaction.checks.slice(0, 4).map(c => <div className="policy-check" key={c.name}>{c.passed ? <CheckCircle size={21} weight="fill" className="success-text" /> : <XCircle size={21} weight="fill" className="danger-text" />}<strong>{c.name}</strong><span>{c.detail}</span></div>)}</section>
          {transaction.reason && <section className="decision-note"><h3>Decision reason</h3><p>{transaction.reason}</p></section>}
        </>}
        {tab === 'Evidence' && <><h3>Business evidence</h3>{transaction.evidence.map(e => { const Glyph = evidenceIcons[e.kind]; return <button className="evidence-source" type="button" key={e.id} onClick={() => setSource(e)}><Glyph size={24} /><span><strong>{e.title}</strong><small>{e.subtitle}</small></span><CaretRight size={18} /></button>; })}</>}
        {tab === 'Policies' && <><h3>Evaluation snapshot</h3>{transaction.checks.map(c => <div className="policy-snapshot" key={c.name}>{c.passed ? <CheckCircle size={23} className="success-text" /> : <XCircle size={23} className="danger-text" />}<div><strong>{c.name}</strong><p>{c.detail}</p><small>Policy version {c.version}</small></div></div>)}</>}
        {tab === 'Overview' && transaction.historicalPayment != null && <section><h3>Existing payment record</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(transaction.historicalPayment,null,2)}</pre></section>}
        {tab === 'Audit log' && <><h3>Request history</h3>{events.map(e => <div className="panel-event" key={e.id}><div><strong>{e.title}</strong><p>{e.detail}</p><small>{e.actor}, {dateLabel(e.createdAt)}</small></div></div>)}</>}
        {transaction.decision === 'Pending' && transaction.reviewBinding && (!transaction.investigation || transaction.investigation.status==='EVALUATED') && state.identity?.role === 'FINANCE' && <div className="review-actions"><div><button type="button" className="button danger-button" disabled={busy} onClick={() => { setDecision('Blocked');  }}>Reject transaction</button><button type="button" className="button primary" disabled={busy||transaction.canApprove===false} onClick={() => { setDecision('Approved');  }}>Approve transaction</button></div></div>}
      </div>
    </aside>
    {source && <Dialog title={source.title} onClose={() => setSource(null)}><div className="source-content"><p>{source.text}</p><dl><dt>Request</dt><dd>{transaction.id}</dd><dt>Source</dt><dd>{source.domain}, {source.sourceId}</dd><dt>Source hash</dt><dd>{source.sourceHash}</dd><dt>Recorded</dt><dd>{dateLabel(transaction.createdAt)}</dd></dl></div><div className="form-footer"><button type="button" className="button primary" onClick={() => setSource(null)}>Done</button></div></Dialog>}
    {decision && <ReviewDialog transaction={transaction} choice={decision === 'Approved' ? 'approve' : 'reject'} onClose={() => setDecision(null)} onSaved={() => { setDecision(null); onDecisionSaved?.(decision); }}/>}
  </>;
}

/** Concise transaction summary with finance actions bound to current backend checks. */
import { useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight, X, FileText, Users, ChartBar, ShieldCheck, CheckCircle, XCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useDemo } from './context';
import { dateLabel, money } from './data';
import { Dialog, IconButton, MerchantImage, Status } from './components';
import { InvestigationPanel } from './InvestigationPanel';
import { DecisionValidation } from './DecisionValidation';
import { BackendService } from './backend-service';
import { approvalRequirementText, decisionExplanation, requirementExplanation } from './risk-explanation';
import { hasCompletedPurchase, transactionStatusLabel } from './transaction-presentation';
import type { Evidence, Transaction } from './types';

const evidenceIcons = { vendor: ShieldCheck, request: FileText, project: Users, budget: ChartBar, purpose: FileText };

export function TransactionPanel({ transaction, onClose, onPrevious, onNext, hasPrevious, hasNext, onDecisionSaved }: {
  transaction: Transaction; onClose: () => void; onPrevious: () => void; onNext: () => void;
  hasPrevious: boolean; hasNext: boolean; onDecisionSaved?: (decision: 'Approved' | 'Blocked') => void;
}) {
  const { state, busy, run } = useDemo();
  const [source, setSource] = useState<Evidence | null>(null), [reason, setReason] = useState('');
  const panel = useRef<HTMLElement>(null), closeRef = useRef(onClose);
  const actionRef = useRef<{signature:string;key:string}|null>(null);
  closeRef.current = onClose;
  const [overlay, setOverlay] = useState(() => window.matchMedia('(max-width: 1535px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1535px)');
    const update = () => setOverlay(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { setReason(''); actionRef.current = null; panel.current?.scrollTo(0, 0); }, [transaction.id]);
  useEffect(() => {
    if (!overlay) return;
    const opener = document.activeElement as HTMLElement;
    panel.current?.focus();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const handle = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, summary, [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', handle); if (opener.isConnected) opener.focus(); };
  }, [overlay]);
  if (!state) return null;

  const merchant = state.merchants?.find(item => item.id === transaction.merchantId) ?? { id: transaction.merchantId, name: 'Vendor details unavailable', category: 'Vendor', domain: '' };
  const agent = state.agents.find(item => item.id === transaction.agentId);
  const events = state.events.filter(event => event.transactionId === transaction.id);
  const financeReviewer = state.identity?.authenticated === true && state.identity.role === 'FINANCE' && state.identity.capabilities.includes('finance:consent');
  const pending = transaction.decision === 'Pending' && ['AWAITING_EVIDENCE','AWAITING_CONSENT'].includes(transaction.workflowStatus ?? '');
  const completed = hasCompletedPurchase(transaction);
  const dateValue=completed&&transaction.historicalPayment?.completedAt?transaction.historicalPayment.completedAt:transaction.createdAt;
  const dateHeading=completed&&transaction.historicalPayment?.completedAt?'Purchase date':'Request date';
  const riskScore = transaction.riskAssessment?.score ?? transaction.risk;

  async function decide(choice: 'approve'|'reject') {
    const trimmed=reason.trim();
    const signature=JSON.stringify([transaction.id,choice,trimmed,transaction.reviewBinding?.version]);
    if (!actionRef.current || actionRef.current.signature !== signature) actionRef.current={signature,key:crypto.randomUUID()};
    const saved=await run(service=>(service as BackendService).reviewTransaction(transaction,choice,trimmed,actionRef.current!.key),
      choice==='approve'?'Finance approval recorded. No payment was executed.':'Purchase request rejected.');
    if(saved){actionRef.current=null;setReason('');onDecisionSaved?.(choice==='approve'?'Approved':'Blocked');}
  }

  return <>
    <div className="detail-backdrop" onClick={onClose} aria-hidden="true" />
    <aside className="detail-panel" ref={panel} tabIndex={-1} role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label={`${merchant.name} request details`}>
      <div className="panel-controls"><IconButton icon={X} label="Close transaction details" onClick={onClose} /><div><IconButton icon={CaretLeft} label="Previous transaction" onClick={onPrevious} disabled={!hasPrevious} /><IconButton icon={CaretRight} label="Next transaction" onClick={onNext} disabled={!hasNext} /></div></div>

      <section className="request-summary" aria-labelledby="request-title">
        <div className="request-summary-vendor"><MerchantImage merchant={merchant} size={46} /><div><p className="eyebrow">{completed ? 'Purchase' : 'Purchase request'}</p><h2 id="request-title">{merchant.name}</h2></div></div>
        <div className="request-summary-amount"><strong>{money(transaction.amount, true)}</strong><Status value={transaction.decision} large label={transactionStatusLabel(transaction)} /></div>
        <p className="request-purpose">{transaction.purpose || 'Purpose not recorded.'}</p>
        {transaction.simulated && <p className="request-sandbox-label">Sandbox request</p>}
        <dl className="request-facts"><div><dt>{dateHeading}</dt><dd>{dateLabel(dateValue)}</dd></div><div><dt>Payment</dt><dd>{completed ? 'Completed in sandbox' : transaction.historicalPayment ? transactionStatusLabel(transaction) : 'No payment created'}</dd></div></dl>
      </section>

      <section className="risk-summary" aria-labelledby="risk-title">
        <div className="risk-summary-heading"><div><h3 id="risk-title">Risk assessment</h3><p>Policy risk score</p></div><strong className={`risk-score ${riskScore >= 70 ? 'risk-high' : riskScore >= 40 ? 'risk-review' : 'risk-low'}`}>{riskScore}<span> / 100</span></strong></div>
        <p>{decisionExplanation(transaction)}</p>
        {transaction.requiresHumanConsent && pending && <p className="human-review-note">A finance reviewer must make the decision.</p>}
      </section>

      {pending && financeReviewer && transaction.reviewBinding && <section className="finance-actions" aria-labelledby="finance-actions-title">
        <h3 id="finance-actions-title">Finance decision</h3>
        {!transaction.canApprove && <p className="approval-block" role="status">{approvalRequirementText(transaction)}</p>}
        <label className="field decision-reason">Decision reason<textarea aria-label="Decision reason" value={reason} onChange={event=>setReason(event.target.value)} required maxLength={1000} placeholder="Add a short reason for the audit record" /></label>
        <div className="finance-action-buttons">
          <button type="button" className="button danger-button" disabled={busy||!reason.trim()} onClick={()=>void decide('reject')}>Reject purchase</button>
          <button type="button" className="button primary" disabled={busy||!reason.trim()||transaction.canApprove!==true} onClick={()=>void decide('approve')}>Approve purchase</button>
        </div>
        <p className="finance-action-note">Approval records a human decision only. Gate will not create or execute a payment from this action.</p>
      </section>}
      {pending && !financeReviewer && <section className="finance-actions"><h3>Finance decision</h3><p>Sign in with an authorized finance account to approve or reject this request.</p><Link className="button" to="/settings">Sign in</Link></section>}

      <details className="transaction-more">
        <summary>Review and evidence details</summary>
        {transaction.reason && <section className="decision-note"><h3>Decision reason</h3><p>{transaction.reason}</p></section>}
        <section className="transaction-details"><h3>Request details</h3><dl>
          <dt>Gatekeeper</dt><dd>{agent?.name ?? 'Historical Gatekeeper'}</dd>
          <dt>Project</dt><dd>{transaction.project}</dd>
          <dt>Category</dt><dd>{transaction.category?.replaceAll('_',' ')??'Not recorded'}</dd>
          <dt>Source record</dt><dd>{transaction.source?`${transaction.source.domain.toUpperCase()} · ${transaction.source.sourceId}`:'Not recorded'}</dd>
          <dt>Authorization</dt><dd>{transaction.authorizationStatus ?? 'Not recorded'}</dd>
        </dl></section>
        {(transaction.investigation||transaction.reviewBinding) && <InvestigationPanel key={`${transaction.id}:${state.identity?.id}:${state.identity?.authenticated}`} transaction={transaction} />}
        {transaction.reviewBinding && <DecisionValidation key={`${transaction.id}:${transaction.reviewBinding.version}`} transaction={transaction} />}
        <section className="business-evidence"><h3>Supporting evidence</h3>{transaction.evidence.length ? <div className="evidence-chain">{transaction.evidence.map(e=>{const Glyph=evidenceIcons[e.kind];return <button type="button" className="evidence-row" key={e.id} onClick={()=>setSource(e)}><span className="evidence-icon"><Glyph size={22}/></span><span><strong>{e.title}</strong><small>{e.subtitle}</small></span><CaretRight size={18}/></button>;})}</div>:<p>No supporting evidence is attached.</p>}</section>
        <section className="policy-checks"><h3>Policy checks</h3>{transaction.checks.map(check=><div className="policy-check" key={check.name}>{check.passed?<CheckCircle size={19} className="success-text"/>:<XCircle size={19} className="danger-text"/>}<strong>{check.name}</strong><span>{check.detail}</span></div>)}</section>
        {(transaction.reviewRequirements?.length??0)>0 && <section className="policy-checks"><h3>Outstanding review items</h3><ul>{transaction.reviewRequirements!.map(item=><li key={item.code}>{requirementExplanation(item.code)}</li>)}</ul></section>}
        {transaction.historicalPayment && <section className="policy-checks"><h3>Payment record</h3><p>{transactionStatusLabel(transaction)}{transaction.historicalPayment.createdAt?` · created ${dateLabel(transaction.historicalPayment.createdAt)}`:''}</p></section>}
        {events.length>0 && <details className="evaluation-history"><summary>Audit history ({events.length})</summary>{events.map(event=><article key={event.id}><strong>{event.title}</strong><p>{event.detail}</p><small>{event.actor} · {dateLabel(event.createdAt)}</small></article>)}</details>}
        <details className="evaluation-history"><summary>Reference</summary><p>Request ID: <code>{transaction.id}</code></p></details>
      </details>
    </aside>
    {source && <Dialog title={source.title} onClose={()=>setSource(null)}><div className="source-content"><p>{source.text}</p><dl><dt>Source</dt><dd>{source.domain}, {source.sourceId}</dd><dt>Source hash</dt><dd>{source.sourceHash}</dd><dt>Recorded</dt><dd>{dateLabel(transaction.createdAt)}</dd></dl></div><div className="form-footer"><button type="button" className="button primary" onClick={()=>setSource(null)}>Done</button></div></Dialog>}
  </>;
}

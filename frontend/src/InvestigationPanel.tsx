/** Shows persisted investigation milestones and archived evaluations; local testing is explicitly labeled. */
import { useEffect,useState } from 'react';
import { useDemo } from './context';
import { api,BackendService } from './backend-service';
import { dateLabel } from './data';
import type { Transaction,Investigation } from './types';
export const investigationLabels:Record<Investigation['status'],string>={WAITING:'Waiting for Gatekeeper',INVESTIGATING:'Gatekeeper investigating',EVIDENCE_RECEIVED:'Evidence received',EVALUATED:'Policy evaluated',FAILED:'Investigation failed'};
interface Evaluation {version:number;createdAt:string;verdict:string;riskScore:number;mode:string;citations:{sourceId:string}[];review:null|{choice:string;reason:string}}
export function InvestigationPanel({transaction}:{transaction:Transaction}){
 const {run,busy}=useDemo(),inv=transaction.investigation!;
 const [history,setHistory]=useState<Evaluation[]>([]),[historyError,setHistoryError]=useState('');
 useEffect(()=>{let active=true;api.call<{items:Evaluation[]}>(`/demo/transactions/${transaction.id}/history`).then(r=>{if(active){setHistory(r.items);setHistoryError('');}}).catch(e=>{if(active)setHistoryError(e.message);});return()=>{active=false;};},[transaction.id,transaction.reviewBinding?.version,transaction.decision]);
 const steps=[['Proposal recorded',true],['Investigation started',!!inv.started_at],['Evidence received',!!inv.evidence_received_at],['Policy evaluated',!!inv.evaluated_at],['Human review recorded',inv.status==='EVALUATED'&&transaction.decision!=='Pending']] as const;
 const canRun=['WAITING','FAILED','EVALUATED'].includes(inv.status)||(inv.status==='INVESTIGATING'&&inv.lease_until&&Date.parse(inv.lease_until)<=Date.now());
 return <section className="investigation-section" aria-label="Gatekeeper investigation">
  <h3>Gatekeeper investigation</h3><p className="investigation-badge" role="status">{investigationLabels[inv.status]}</p>
  <p>{inv.mode==='LOCAL_TEST'?'Local test using imported evidence. No live DevRev investigation.':inv.mode==='GATEKEEPER'?'Evidence submitted by a scoped Gatekeeper connection.':'Waiting for a Gatekeeper to claim this proposal. Live DevRev setup is pending.'}</p>
  <ol className="investigation-steps">{steps.map(([label,complete])=><li key={label} data-complete={complete}>{complete?'✓':'○'} {label}</li>)}</ol>
  {inv.failure_reason&&<p className="inline-error" role="alert">{inv.failure_reason}</p>}
  {transaction.unresolvedQuestions?.length ? <div><h4>Unresolved questions</h4><ul>{transaction.unresolvedQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>:null}
  {transaction.previousReview&&<p className="demo-note">An earlier version was {transaction.previousReview.choice==='approve'?'approved':'rejected'}: {transaction.previousReview.reason}. This evaluation needs a new review.</p>}
  {canRun&&<button type="button" className="button" disabled={busy} onClick={()=>{void run(service=>(service as BackendService).investigate(transaction),'Local investigation updated.');}}>{inv.status==='EVALUATED'?'Recheck demo evidence':'Run local investigation'}</button>}
  <details className="evaluation-history"><summary>Evaluation history ({history.length})</summary>
   {historyError&&<p role="alert">{historyError}</p>}
   <p>The latest ten snapshots are shown. Earlier results remain stored.</p>
   {history.map(e=><article key={e.version}><strong>Version {e.version}: {e.verdict} · {e.riskScore} risk points</strong><p>{e.mode==='INITIAL_CHECK'?'Initial policy check':e.mode==='LOCAL_TEST'?'Local investigation':'Gatekeeper investigation'} · {dateLabel(e.createdAt)}</p><p>{e.citations.map(c=>c.sourceId).join(', ')||'No verified citations'}</p>{e.review&&<p>Human review: {e.review.choice==='approve'?'approved':'rejected'} — {e.review.reason}</p>}</article>)}
  </details>
 </section>;
}

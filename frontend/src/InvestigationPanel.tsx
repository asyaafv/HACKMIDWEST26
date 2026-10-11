/** Shows persisted investigation milestones and archived evaluations; local testing is explicitly labeled. */
import { useEffect,useState,useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from './context';
import { api,BackendService } from './backend-service';
import { dateLabel } from './data';
import type { Transaction,Investigation } from './types';
import { coordinatorBlockers,latestCoordinatorRun,startCoordinatorReview,type CoordinatorAvailability,type CoordinatorDetail } from './orchestration-api';
export const investigationLabels:Record<Investigation['status'],string>={WAITING:'Waiting for Gatekeeper',INVESTIGATING:'Gatekeeper investigating',EVIDENCE_RECEIVED:'Evidence received',EVALUATED:'Policy evaluated',FAILED:'Investigation failed'};
interface Evaluation {version:number;createdAt:string;verdict:string;riskScore:number;mode:string;citations:{sourceId:string}[];review:null|{choice:string;reason:string}}
export function InvestigationPanel({transaction}:{transaction:Transaction}){
 const {run,busy,state}=useDemo(),inv=transaction.investigation;
 const authenticated=!!state?.identity?.authenticated;
 const [availability,setAvailability]=useState<CoordinatorAvailability|null>(null),[detail,setDetail]=useState<CoordinatorDetail|null>(null),[coordinatorError,setCoordinatorError]=useState(''),[starting,setStarting]=useState(false);
 const runId=useRef<string|null>(null),mounted=useRef(false),generation=useRef(0);
 useEffect(()=>{
  if(!authenticated)return;
  mounted.current=true;let active=true,timer:ReturnType<typeof setTimeout>;
  async function poll(){const version=generation.current;
   try{
    const configuration=await api.call<CoordinatorAvailability>('/orchestrations/status');
    if(!active)return;setAvailability(configuration);
    if(!configuration.blockers.some(code=>['WORKSPACE_NOT_CONFIGURED','WORKSPACE_NOT_AUTHORIZED','ORCHESTRATION_SCHEMA_MISSING'].includes(code))){
     const next=runId.current?await api.call<CoordinatorDetail>(`/orchestrations/${runId.current}`):await latestCoordinatorRun(transaction.id);
     if(active&&version===generation.current){runId.current=next?.run.id??null;setDetail(next);setCoordinatorError('');}
    }
   }catch(e){if(active&&version===generation.current)setCoordinatorError(e instanceof Error?e.message:'Coordinator status unavailable.');}
   finally{if(active)timer=setTimeout(()=>{if(!document.hidden)void poll();else timer=setTimeout(()=>void poll(),5000);},5000);}
  }
  void poll();return()=>{active=false;mounted.current=false;clearTimeout(timer);};
 },[authenticated,transaction.id]);
 async function start(){if(starting||!transaction.reviewBinding)return;generation.current++;setStarting(true);setCoordinatorError('');
  try{const result=await startCoordinatorReview(transaction.id,transaction.reviewBinding.version);runId.current=result.runId;
   const next=await api.call<CoordinatorDetail>(`/orchestrations/${result.runId}`);if(mounted.current)setDetail(next);
  }catch(e){if(mounted.current)setCoordinatorError(e instanceof Error?e.message:'DevRev review could not start.');}
  finally{if(mounted.current)setStarting(false);}
 }
 const [history,setHistory]=useState<Evaluation[]>([]),[historyError,setHistoryError]=useState('');
 useEffect(()=>{if(!inv)return;let active=true;api.call<{items:Evaluation[]}>(authenticated?`/requests/${transaction.id}/history`:`/demo/transactions/${transaction.id}/history`).then(r=>{if(active){setHistory(r.items);setHistoryError('');}}).catch(e=>{if(active)setHistoryError(e.message);});return()=>{active=false;};},[transaction.id,transaction.reviewBinding?.version,transaction.decision,authenticated,!!inv]);
 if(authenticated){const authorized=['OPERATOR','ADMIN'].includes(state!.identity!.role)&&state!.identity!.capabilities.includes('request:read');
  const sameVersion=detail?.run.snapshot.version===transaction.reviewBinding?.version;
  return <section className="investigation-section" aria-label="Gatekeeper investigation">
   <h3>Gatekeeper investigation</h3><p className="investigation-badge" role="status">{detail?.run.status??'Not started'}</p>
   <p>Read-only DevRev review. Financial approval remains with an independent human.</p>
   {availability?.blockers.map(code=><p key={code} className="demo-note">{coordinatorBlockers[code]??code}</p>)}
   {!authorized&&<p className="demo-note">An authorized OPERATOR or ADMIN with request access must start this review.</p>}
   {coordinatorError&&<p className="inline-error" role="alert">{coordinatorError}</p>}
   <button type="button" className="button" disabled={busy||starting||!authorized||!availability?.ready||sameVersion||detail?.run.status==='RUNNING'} onClick={()=>void start()}>{starting?'Starting DevRev review…':'Run DevRev review'}</button>
   {detail&&<><p>Run ID: {detail.run.id}</p>
    <ol className="investigation-steps">{detail.stages.map(stage=><li key={stage.id} data-complete={stage.status==='SUCCEEDED'}>
     <strong>{['Purchase Authorization','Risk & Fraud','Approval Manager'][stage.ordinal-1]}: {stage.status}</strong>
     {stage.findings&&<p>{stage.findings.agentCommentary.summary}</p>}
     {stage.error_code&&<p className="inline-error">{stage.error_code}</p>}
    </li>)}</ol>
    {detail.run.escalation&&<p role="status">Human review: {detail.run.escalation.reason}. {detail.run.escalation.nextAction}</p>}
    {detail.run.error_code&&<p className="inline-error" role="alert">Review stopped: {detail.run.error_code}. An operator must review the failure before explicit recovery.</p>}
    <details className="evaluation-history"><summary>DevRev execution records</summary>{detail.stages.map(stage=><article key={stage.id}>
     <p>Agent: {stage.agent_id}</p><p>Published version: {stage.agent_version}</p><p>Session: {stage.session_id??'Not confirmed'}</p><p>MCP trace: {stage.tool_result?.traceId??'No successful tool execution recorded'}</p>
    </article>)}<p>{detail.events.filter(e=>!e.ignored).length} authenticated callback records</p></details>
   </>}
  </section>;
 }
 if(!inv)return <section className="investigation-section" aria-label="Gatekeeper investigation"><h3>Gatekeeper investigation</h3><p>Sign in as an authorized operator to run a read-only DevRev review.</p><Link className="button" to="/settings">Sign in</Link></section>;
 const steps=[['Proposal recorded',true],['Investigation started',!!inv.started_at],['Evidence received',!!inv.evidence_received_at],['Policy evaluated',!!inv.evaluated_at],['Human review recorded',inv.status==='EVALUATED'&&transaction.decision!=='Pending']] as const;
 const canRun=['WAITING','FAILED','EVALUATED'].includes(inv.status)||(inv.status==='INVESTIGATING'&&inv.lease_until&&Date.parse(inv.lease_until)<=Date.now());
 return <section className="investigation-section" aria-label="Gatekeeper investigation">
  <h3>Gatekeeper investigation</h3><p className="investigation-badge" role="status">{investigationLabels[inv.status]}</p>
  <Link className="button" to="/settings">Sign in to run DevRev review</Link>
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

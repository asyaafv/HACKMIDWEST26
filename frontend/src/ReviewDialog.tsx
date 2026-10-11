/** Exact, expiring enterprise review records a decision without payment or budget side effects. */
import { useEffect, useRef, useState } from 'react';
import { api, BackendService } from './backend-service';
import type { Preview } from './live-api';
import { usd } from './live-api';
import { useDemo } from './context';
import { Dialog } from './components';
import type { Transaction } from './types';
export function ReviewDialog({transaction,choice,onClose,onSaved}:{transaction:Transaction;choice:'approve'|'reject';onClose:()=>void;onSaved:()=>void}) {
 const {run,busy}=useDemo(); const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[reason,setReason]=useState(''),[resolutions,setResolutions]=useState<string[]>([]),[now,setNow]=useState(Date.now());
 const key=useRef(crypto.randomUUID());
 useEffect(()=>{let active=true;api.call<Preview>(`/requests/${transaction.id}/preview`,{},key.current).then(p=>{if(active)setPreview(p);}).catch(e=>{if(active)setError(e.message);});const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;clearInterval(timer);};},[transaction.id]);
 const required=preview?.decision.reviewRequirements.filter(r=>r.resolution==='HUMAN_JUDGMENT').map(r=>r.code)??[];
 return <Dialog title={choice==='approve'?'Approve enterprise request':'Block enterprise request'} description="Records the reviewed business decision. No payment is created." onClose={onClose} busy={busy}>
  {error&&<p role="alert">{error}</p>}{!preview?<p>Loading the exact backend preview…</p>:<form onSubmit={e=>{e.preventDefault();void run(async service=>{const next=await (service as BackendService).review(transaction.id,preview,choice,reason,resolutions);return next;},'Enterprise decision recorded.').then(ok=>{if(ok)onSaved();});}}>
   <p><strong>{usd(preview.proposal.amountMinor)} USD</strong> · {preview.proposal.purpose}</p><p>Configured destination: {preview.destinationRef}</p><p>Version {preview.expectedVersion} · expires {preview.expiresAt}</p>
   {required.map(code=><label className="toggle-field" key={code}><span>{code.replaceAll('_',' ')}</span><input type="checkbox" checked={resolutions.includes(code)} onChange={e=>setResolutions(e.target.checked?[...resolutions,code]:resolutions.filter(c=>c!==code))}/></label>)}
   <label className="field">Decision reason<textarea aria-label="Decision reason" value={reason} onChange={e=>setReason(e.target.value)} required maxLength={1000}/></label>
   <div className="form-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy||Date.parse(preview.expiresAt)<=now||!reason.trim()||(choice==='approve'&&(!preview.decision.executionAllowed||required.some(c=>!resolutions.includes(c))))}>Record {choice==='approve'?'approval':'rejection'}</button></div>
  </form>}
 </Dialog>;
}

/** Records a snapshot-bound review of an existing transaction without changing its financial state. */
import { useRef, useState } from 'react';
import { BackendService } from './backend-service';
import { useDemo } from './context';
import { Dialog } from './components';
import { money } from './data';
import type { Transaction } from './types';
export function ReviewDialog({transaction,choice,onClose,onSaved}:{transaction:Transaction;choice:'approve'|'reject';onClose:()=>void;onSaved:()=>void}) {
 const {run,busy}=useDemo();const [reason,setReason]=useState('');
 // Freeze the reviewed snapshot and action key so a lost response retries identical intent.
 const snapshot=useRef(transaction),key=useRef(crypto.randomUUID());
 return <Dialog title={choice==='approve'?'Approve transaction':'Reject transaction'} onClose={onClose} busy={busy}>
 <form onSubmit={e=>{e.preventDefault();void run(service=>(service as BackendService).reviewTransaction(snapshot.current,choice,reason,key.current),'Transaction review recorded.').then(ok=>{if(ok)onSaved();});}}>
  <p><strong>{money(snapshot.current.amount)} USD</strong> · {snapshot.current.purpose}</p>
  <label className="field">Decision reason<textarea aria-label="Decision reason" value={reason} onChange={e=>setReason(e.target.value)} required maxLength={1000}/></label>
  <div className="form-footer"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy||!reason.trim()||(choice==='approve'&&transaction.canApprove===false)}>Record {choice==='approve'?'approval':'rejection'}</button></div>
 </form></Dialog>;
}

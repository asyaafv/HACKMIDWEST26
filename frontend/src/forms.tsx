/** Request and identity forms; connected requests are validated by the authoritative backend. */
import { useState } from 'react';
import { useDemo } from './context';
import { avatarUrl, departments } from './data';
import { Dialog, ErrorMessage, FormFooter } from './components';
import { api, BackendService } from './backend-service';
import { minorUnits } from './live-api';
import type { Gatekeeper, Priority, RiskAssessment } from './types';

type SourceResult = {domain:'pm'|'crm'|'document';source_id:string;project_id:string;title?:string;kind?:string};
type PurchasePreview = {decision:{verdict:string;riskScore:number;riskAssessment?:RiskAssessment;factors:{code:string;points:number}[];executionAllowed:boolean;rules:{code:string;result:string}[];reviewRequirements:{code:string;resolution:string}[]};evidence:{complete:boolean;items:unknown[];missing:string[];unresolvedRequirements?:string[]}};
const sourceLabel = {pm:'Issue or ticket',crm:'Account',document:'Document'};

export function GatekeeperForm({ agent, onClose }: { agent?: Gatekeeper; onClose: () => void }) {
  const { run, busy } = useDemo();
  const [name, setName] = useState(agent?.name ?? ''), [description, setDescription] = useState(agent?.description ?? ''), [department, setDepartment] = useState(agent?.department ?? ''), [avatar, setAvatar] = useState<number | null>(agent?.avatar ?? null), [error, setError] = useState('');
  return <Dialog title={agent ? 'Edit Gatekeeper' : 'Create Gatekeeper'} onClose={onClose} busy={busy} wide><form onSubmit={async e => {
    e.preventDefault(); if (!avatar) { setError('Choose a character portrait.'); return; }
    const input = { name, description, department, avatar };
    if (await run(s => agent ? s.updateGatekeeper(agent.id, input) : s.createGatekeeper(input), agent ? 'Gatekeeper updated.' : 'Gatekeeper created.')) onClose();
  }}>
    <label className="field">Name<input value={name} onChange={e => setName(e.target.value)} autoFocus required maxLength={60} placeholder="e.g. Procurement-08" /></label>
    <label className="field">Description<textarea value={description} onChange={e => setDescription(e.target.value)} required maxLength={500} rows={3} placeholder="Describe what this Gatekeeper is responsible for" /></label>
    <label className="field">Department <span className="optional">Optional</span><select value={department} onChange={e => setDepartment(e.target.value)}><option value="">Choose a department</option>{!departments.includes(department) && department && <option>{department}</option>}{departments.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label>
    <fieldset className="portrait-field"><legend>Choose a character</legend><div className="portrait-picker">{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <label className={`portrait-choice ${avatar === n ? 'selected' : ''}`} key={n}><input type="radio" name="avatar" value={n} checked={avatar === n} onChange={() => { setAvatar(n); setError(''); }} aria-label={`Character ${n}`} /><img src={avatarUrl(n)} alt={`Character ${n}`} width={72} height={72} /><span>Character {n}</span></label>)}</div></fieldset>
    {error && <ErrorMessage>{error}</ErrorMessage>}<FormFooter busy={busy} onClose={onClose}>{agent ? 'Save changes' : 'Create Gatekeeper'}</FormFooter>
  </form></Dialog>;
}

/** DevRev-facing proposal fields map exactly to Gate's shared REST/MCP contract. */
export function RequestForm({ onClose, onCreated, simulation = false }: { onClose: () => void; onCreated: (id: string) => void; simulation?: boolean }) {
 const {state,run,busy}=useDemo();const merchants=state!.merchants??[];
 const active=state!.agents.filter(a=>a.active&&(simulation?a.canPurchase!==false:a.ownerId===state!.identity?.id));
 const [agentId,setAgent]=useState(active[0]?.id??''),[merchantId,setMerchant]=useState(merchants[0]?.id??''),[amount,setAmount]=useState(''),[category,setCategory]=useState<'diagnostics'|'incident_response'>('diagnostics'),[purpose,setPurpose]=useState(''),[query,setQuery]=useState(''),[sourceId,setSource]=useState(''),[sources,setSources]=useState<SourceResult[]>([]),[error,setError]=useState('');
 const [searching,setSearching]=useState(false),[previewing,setPreviewing]=useState(false),[preview,setPreview]=useState<{signature:string;result:PurchasePreview}|null>(null);
 const [started,setStarted]=useState(false);
 const project=active.find(a=>a.id===agentId)?.projectId;
 const source=sources.find(s=>`${s.domain}:${s.source_id}`===sourceId&&s.project_id===project);
 const signature=JSON.stringify({agentId,project,merchantId,amount,category,purpose,sourceId});
 const currentPreview=preview?.signature===signature?preview.result:null;
 return <Dialog title={simulation ? "Simulate purchase" : "Create request"} onClose={onClose} busy={busy||previewing}><form onSubmit={async e=>{
  e.preventDefault();setError('');const source=sources.find(s=>`${s.domain}:${s.source_id}`===sourceId);
  try {if(!project||!source||source.project_id!==project)throw new Error('Choose a purchasing agent and a source in its project.');const amountMinor=minorUnits(amount);
   const proposal={agentId,projectId:project,merchantId,amountMinor,currency:'USD' as const,category,purpose:purpose.trim(),source:{domain:source.domain,sourceId:source.source_id}};
   if(!currentPreview){setPreviewing(true);try{const result=await api.call<PurchasePreview>(simulation?'/demo/purchases/preview':'/policy/preview',proposal);setPreview({signature,result});}finally{setPreviewing(false);}return;}
   let id='';const ok=await run(async service=>{if(!started){(service as BackendService).newRequest();setStarted(true);}const next=await service.createRequest({agentId,merchantId,amount:Number(amountMinor),priority:'P2' as Priority,project,purpose:proposal.purpose,category,source:proposal.source});id=next.transactions[0].id;return next;},simulation?'Simulated purchase recorded.':'Backend request created.');if(ok){onClose();onCreated(id);}
  }catch(e){setError(e instanceof Error?e.message:'Request failed.');}
 }}>
  <label className="field">{simulation ? "Purchasing agent" : "Gatekeeper"}<select aria-label={simulation ? "Purchasing agent" : "Gatekeeper"} value={agentId} onChange={e=>setAgent(e.target.value)} required>{active.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  <p className="field-help">Assigned project: {state!.catalog?.projects.find(p=>p.id===project)?.name??'Select an assigned Gatekeeper'}</p>
  <label className="field">Merchant<select aria-label="Merchant" value={merchantId} onChange={e=>setMerchant(e.target.value)} required>{merchants.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
  <label className="field">Amount (USD)<input aria-label="Amount (USD)" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
  <label className="field">Spend category<select aria-label="Spend category" value={category} onChange={e=>setCategory(e.target.value as typeof category)}><option value="diagnostics">Diagnostics</option><option value="incident_response">Incident response</option></select></label>
  <label className="field">Business purpose<textarea aria-label="Business purpose" value={purpose} onChange={e=>setPurpose(e.target.value)} required maxLength={1000}/></label>
  <label className="field">Find imported DevRev context<input aria-label="Find supporting evidence" value={query} onChange={e=>setQuery(e.target.value)} maxLength={200} placeholder="Issue, ticket, account, or document ID" /></label><button className="button" type="button" disabled={busy||searching||query.length<2} onClick={()=>{setSearching(true);setError('');void api.call<{items:SourceResult[]}>(`${simulation ? '/demo' : ''}/sources/search?q=${encodeURIComponent(query)}`).then(r=>{setSources(r.items);setSource('');}).catch(e=>setError(e.message)).finally(()=>setSearching(false));}}>{searching?'Searching…':'Search sources'}</button>
  <label className="field">Source record<select aria-label="Supporting source" value={source?.project_id===project?sourceId:''} onChange={e=>setSource(e.target.value)} required><option value="">Select a record in this project</option>{sources.filter(s=>s.project_id===project).map(s=><option key={`${s.domain}:${s.source_id}`} value={`${s.domain}:${s.source_id}`}>{s.source_id} · {s.title??s.kind??sourceLabel[s.domain]} ({sourceLabel[s.domain]})</option>)}</select></label>
  {currentPreview&&<section className="purchase-preview" aria-live="polite"><h3>Gate policy preview</h3><p><strong>{currentPreview.decision.verdict}</strong> · Risk points {currentPreview.decision.riskScore}/{currentPreview.decision.riskAssessment?.maximum??100} · {currentPreview.evidence.items.length} linked records</p><p>{currentPreview.decision.riskAssessment?.summary??'Risk points and policy findings are returned by the backend.'}</p><p>{currentPreview.evidence.complete?'Evidence complete':'Evidence needs review'}. {currentPreview.decision.executionAllowed?'Within policy limits.':'Human review or policy action required.'}</p><ul>{currentPreview.decision.factors.map(f=><li key={f.code}>{f.code.replaceAll('_',' ')}: +{f.points} risk points</li>)}</ul><ul>{currentPreview.decision.rules.map(r=><li key={r.code}>{r.code.replaceAll('_',' ')}: {r.result}</li>)}</ul>{currentPreview.evidence.missing.map(m=><p key={m}>Missing: {m.replaceAll('_',' ')}</p>)}{currentPreview.evidence.unresolvedRequirements?.filter(r=>r.startsWith('CONTRADICTORY')).map(r=><p key={r}>Conflict: {r}</p>)}{currentPreview.decision.reviewRequirements.map(r=><p key={r.code}>Review: {r.code.replaceAll('_',' ')}</p>)}</section>}
  {error&&<ErrorMessage>{error}</ErrorMessage>}<p className="demo-note">Preview policy only checks the proposal. Select Record simulated request to save it in PostgreSQL. No payment is executed.</p><div className="form-footer"><button type="button" className="button" onClick={onClose} disabled={busy||previewing}>Cancel</button><button type="submit" className="button primary" disabled={busy||previewing||!active.length}>{previewing?'Evaluating…':currentPreview?(simulation?'Record simulated request':'Create request'):'Preview policy'}</button></div>
 </form></Dialog>;
}

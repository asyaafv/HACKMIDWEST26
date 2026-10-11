/** Request and identity forms; connected requests are validated by the authoritative backend. */
import { useState } from 'react';
import { useDemo } from './context';
import { avatarUrl, departments } from './data';
import { Dialog, ErrorMessage, FormFooter } from './components';
import { api, BackendService } from './backend-service';
import { minorUnits } from './live-api';
import type { Gatekeeper, Priority } from './types';

export function GatekeeperForm({ agent, onClose }: { agent?: Gatekeeper; onClose: () => void }) {
  const { run, busy } = useDemo();
  const [name, setName] = useState(agent?.name ?? ''), [description, setDescription] = useState(agent?.description ?? ''), [department, setDepartment] = useState(agent?.department ?? ''), [avatar, setAvatar] = useState<number | null>(agent?.avatar ?? null), [error, setError] = useState('');
  return <Dialog title={agent ? 'Edit Gatekeeper' : 'Create Gatekeeper'} description="Give your agent a name, a purpose, and a character." onClose={onClose} busy={busy} wide><form onSubmit={async e => {
    e.preventDefault(); if (!avatar) { setError('Choose a character portrait.'); return; }
    const input = { name, description, department, avatar };
    if (await run(s => agent ? s.updateGatekeeper(agent.id, input) : s.createGatekeeper(input), agent ? 'Gatekeeper updated.' : 'Gatekeeper created.')) onClose();
  }}>
    <label className="field">Name<input value={name} onChange={e => setName(e.target.value)} autoFocus required maxLength={60} placeholder="e.g. Procurement-08" /></label>
    <label className="field">Description<textarea value={description} onChange={e => setDescription(e.target.value)} required maxLength={500} rows={3} placeholder="Describe what this Gatekeeper is responsible for" /></label>
    <label className="field">Department <span className="optional">Optional</span><select value={department} onChange={e => setDepartment(e.target.value)}><option value="">Choose a department</option>{!departments.includes(department) && department && <option>{department}</option>}{departments.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label>
    <fieldset className="portrait-field"><legend>Choose a character</legend><p>All ten original portraits are available. Characters can be shared.</p><div className="portrait-picker">{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <label className={`portrait-choice ${avatar === n ? 'selected' : ''}`} key={n}><input type="radio" name="avatar" value={n} checked={avatar === n} onChange={() => { setAvatar(n); setError(''); }} aria-label={`Character ${n}`} /><img src={avatarUrl(n)} alt={`Character ${n}`} width={72} height={72} /><span>Character {n}</span></label>)}</div></fieldset>
    {error && <ErrorMessage>{error}</ErrorMessage>}<FormFooter busy={busy} onClose={onClose}>{agent ? 'Save changes' : 'Create Gatekeeper'}</FormFooter>
  </form></Dialog>;
}

/** Purchase proposals use assigned projects, authorized sources, and exact integer USD cents. */
export function RequestForm({ onClose, onCreated, simulation = false }: { onClose: () => void; onCreated: (id: string) => void; simulation?: boolean }) {
 const {state,run,busy}=useDemo();const merchants=state!.merchants??[];
 const active=state!.agents.filter(a=>a.active&&(simulation||a.ownerId===state!.identity?.id));
 const [agentId,setAgent]=useState(active[0]?.id??''),[merchantId,setMerchant]=useState(merchants[0]?.id??''),[amount,setAmount]=useState(''),[purpose,setPurpose]=useState(''),[query,setQuery]=useState(''),[sourceId,setSource]=useState(''),[sources,setSources]=useState<{domain:'pm'|'crm'|'document';source_id:string}[]>([]),[error,setError]=useState('');
 const [started,setStarted]=useState(false);
 const project=active.find(a=>a.id===agentId)?.projectId;
 return <Dialog title={simulation ? "Simulate purchase" : "Create request"} description={simulation ? "Propose a purchase and inspect Gate’s real policy evaluation." : "Evaluate the business reason against backend evidence and policy."} onClose={onClose} busy={busy}><form onSubmit={async e=>{
  e.preventDefault();setError('');const source=sources.find(s=>`${s.domain}:${s.source_id}`===sourceId);
  try {if(!project||!source)throw new Error('Choose a purchasing agent and a supporting source.');const amountMinor=minorUnits(amount);let id='';const ok=await run(async service=>{if(!started){(service as BackendService).newRequest();setStarted(true);}const next=await service.createRequest({agentId,merchantId,amount:Number(amountMinor),priority:'P2' as Priority,project,purpose,source:{domain:source.domain,sourceId:source.source_id}});id=next.transactions[0].id;return next;},simulation?'Simulated purchase recorded.':'Backend request created.');if(ok){onClose();onCreated(id);}}catch(e){setError(e instanceof Error?e.message:'Request failed.');}
 }}>
  <label className="field">{simulation ? "Purchasing agent" : "Gatekeeper"}<select aria-label={simulation ? "Purchasing agent" : "Gatekeeper"} value={agentId} onChange={e=>setAgent(e.target.value)} required>{active.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  <label className="field">Merchant<select aria-label="Merchant" value={merchantId} onChange={e=>setMerchant(e.target.value)} required>{merchants.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
  <label className="field">Amount (USD)<input aria-label="Amount (USD)" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
  <p>Project: {state!.catalog?.projects.find(p=>p.id===project)?.name??'Select an assigned Gatekeeper'}</p>
  <label className="field">Business purpose<textarea aria-label="Business purpose" value={purpose} onChange={e=>setPurpose(e.target.value)} required maxLength={1000}/></label>
  <label className="field">Find supporting evidence<input aria-label="Find supporting evidence" value={query} onChange={e=>setQuery(e.target.value)} maxLength={200}/></label><button className="button" type="button" disabled={busy||query.length<2} onClick={()=>{void api.call<{items:typeof sources}>(`${simulation ? '/demo' : ''}/sources/search?q=${encodeURIComponent(query)}`).then(r=>setSources(r.items)).catch(e=>setError(e.message));}}>Search sources</button>
  <label className="field">Supporting source<select aria-label="Supporting source" value={sourceId} onChange={e=>setSource(e.target.value)} required><option value="">Select source</option>{sources.map(s=><option key={`${s.domain}:${s.source_id}`} value={`${s.domain}:${s.source_id}`}>{s.domain}, {s.source_id}</option>)}</select></label>
  {error&&<ErrorMessage>{error}</ErrorMessage>}<p>{simulation ? "Simulation uses imported demo evidence and deterministic policies. Live DevRev investigation is still pending. No payment is executed." : "No payment is created or executed."}</p><FormFooter busy={busy||!active.length} onClose={onClose}>{simulation ? "Simulate purchase" : "Check and submit"}</FormFooter>
 </form></Dialog>;
}

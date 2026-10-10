import { useState } from 'react';
import { useDemo } from './context';
import { avatarUrl, departments, merchants } from './data';
import { Dialog, ErrorMessage, FormFooter } from './components';
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

export function RequestForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { state, run, busy } = useDemo();
  const [agentId, setAgent] = useState(state!.agents.find(a => a.active)?.id ?? ''), [merchantId, setMerchant] = useState('github'), [amount, setAmount] = useState(''), [priority, setPriority] = useState<Priority>('P2'), [project, setProject] = useState(''), [purpose, setPurpose] = useState(''), [error, setError] = useState('');
  const active = state!.agents.filter(a => a.active);
  return <Dialog title="Create request" description="Propose a purchase and check it against your local demo policies." onClose={onClose} busy={busy}><form onSubmit={async e => {
    e.preventDefault();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { setError('Enter a USD amount with no more than two decimal places.'); return; }
    let created = '';
    const ok = await run(async s => { const next = await s.createRequest({ agentId, merchantId, amount: Math.round(Number(amount) * 100), priority, project, purpose }); created = next.transactions[0].id; return next; }, 'Demo request created.');
    if (ok) { onClose(); onCreated(created); }
  }}>
    <label className="field">Gatekeeper<select required value={agentId} onChange={e => setAgent(e.target.value)}>{!active.length && <option value="">No active Gatekeepers</option>}{active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label className="field">Merchant<select value={merchantId} onChange={e => setMerchant(e.target.value)}>{merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <div className="form-grid"><label className="field">Amount (USD)<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" autoFocus /></label><label className="field">Priority<select value={priority} onChange={e => setPriority(e.target.value as Priority)}><option value="P2">P2 · Normal</option><option value="P1">P1 · High</option><option value="P0">P0 · Urgent</option></select></label></div>
    <label className="field">Project<input value={project} onChange={e => setProject(e.target.value)} required maxLength={100} placeholder="e.g. Engineering expansion" /></label>
    <label className="field">Business purpose<textarea value={purpose} onChange={e => setPurpose(e.target.value)} required maxLength={500} rows={3} placeholder="Explain why this purchase is needed" /></label>
    {error && <ErrorMessage>{error}</ErrorMessage>}<p className="demo-note">Demo only. Submitting creates a local record and evaluation; no purchase or payment is executed.</p><FormFooter busy={busy || !active.length} onClose={onClose}>Check and submit</FormFooter>
  </form></Dialog>;
}

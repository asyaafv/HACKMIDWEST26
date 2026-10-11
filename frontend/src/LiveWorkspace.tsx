/** Live REST workspace for proposal, independent finance consent, and durable sandbox outcomes. */
import { useEffect, useRef, useState } from 'react';
import { LiveApi, minorUnits, usd, type Catalog, type Identity, type Preview, type Proposal, type SpendRequest } from './live-api';
import './live.css';
const api = new LiveApi();
function Facts({ title, value }: { title: string; value: unknown }) {
  return <details><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}
export default function LiveWorkspace() {
  const [identity, setIdentity] = useState<Identity | null>(null), [catalog, setCatalog] = useState<Catalog | null>(null);
  const [requests, setRequests] = useState<SpendRequest[]>([]), [current, setCurrent] = useState<SpendRequest | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [integrations, setIntegrations] = useState<unknown>(null), [events, setEvents] = useState<unknown>(null);
  const [token, setToken] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [agentId, setAgentId] = useState(''), [merchantId, setMerchantId] = useState(''), [amount, setAmount] = useState('1700.00');
  const [category, setCategory] = useState<Proposal['category']>('diagnostics');
  const [purpose, setPurpose] = useState('Incident diagnostics'), [query, setQuery] = useState('GATE-ISSUE');
  const [sources, setSources] = useState<{ domain: Proposal['source']['domain']; source_id: string }[]>([]), [source, setSource] = useState<Proposal['source'] | null>(null);
  const [sourceDetail, setSourceDetail] = useState<unknown>(null), [reason, setReason] = useState(''), [resolutions, setResolutions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [now, setNow] = useState(Date.now());
  const action = useRef(crypto.randomUUID()), locked = useRef(false);
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { const message = e instanceof Error ? e.message : 'Request failed.'; setError(message); if (/STALE_PREVIEW|STALE_EVIDENCE/.test(message)) setPreview(null); }
    finally { locked.current = false; setBusy(false); }
  }
  async function refresh() {
    const c = await api.call<Catalog>('/catalog'); setCatalog(c);
    setRequests((await api.call<{ items: SpendRequest[] }>('/requests')).items);
    setIntegrations(await api.call('/integrations'));
  }
  async function connect() {
    const me = await api.call<Identity>('/me');
    await refresh(); setIdentity(me);
  }
  async function detail(id: string) {
    const next = await api.call<SpendRequest>(`/requests/${id}`); setCurrent(next);
    setEvents(await api.call(`/requests/${id}/events`));
    // Consent never follows a silently changed request version.
    setPreview(previous => previous && previous.expectedVersion === next.version ? previous : null);
  }
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!identity || !current || ['COMPLETED','FAILED','CANCELLED','REJECTED','EXPIRED','AWAITING_EVIDENCE','AWAITING_CONSENT'].includes(current.workflowStatus)) return;
    const timer = setInterval(() => { if (!document.hidden) void run(async () => { await detail(current.id); await refresh(); }); }, 15000);
    return () => clearInterval(timer);
  }, [identity, current?.id, current?.workflowStatus]);
  const agent = catalog?.agents.find(a => a.id === agentId);
  const expired = !preview || Date.parse(preview.expiresAt) <= now;
  const required = preview?.decision.reviewRequirements.filter(r => r.resolution === 'HUMAN_JUDGMENT').map(r => r.code) ?? [];
  const resetPreview = () => { setPreview(null); setReason(''); setResolutions([]); };
  return <main className="live-workspace">
    <header><a href="/transactions">Gate visual demo</a><h1>Gate live workspace</h1><p>Real backend state, simulator payments, no money moves</p></header>
    <p role="alert">{error}</p><p role="status">{notice}</p>
    {!identity ? <section><h2>Connect your identity</h2><p>For local testing, use an operator or finance token from the private demo credentials file. Use separate browser profiles for independent reviewers.</p>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { api.clear(); api.token = token.trim(); await connect(); setToken(''); }); }}>
        <label>Local bearer token<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} required /></label><button disabled={busy}>Connect locally</button>
      </form>
      <details><summary>HTTPS browser login</summary><p>Requires provisioned human credentials and same-origin HTTPS hosting.</p><form onSubmit={e => { e.preventDefault(); void run(async () => { api.clear(); const login = await api.call<{ csrfToken: string }>('/auth/login', { username, password }); api.csrf = login.csrfToken; setPassword(''); await connect(); }); }}>
        <label>Username<input value={username} autoComplete="username" onChange={e => setUsername(e.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button disabled={busy}>Sign in</button>
      </form></details></section> : <>
      <section><h2>{identity.role} workspace</h2><p>Principal {identity.id}</p><button disabled={busy} onClick={() => void run(refresh)}>Refresh from backend</button>{' '}<button disabled={busy} onClick={() => void run(async () => { if (!api.token) await api.call('/auth/logout', {}); api.clear(); setIdentity(null); setCatalog(null); setCurrent(null); setRequests([]); setIntegrations(null); setEvents(null); setSourceDetail(null); resetPreview(); action.current = crypto.randomUUID(); })}>Disconnect</button>
        <Facts title="Integration readiness" value={integrations} />
        <h3>Project budgets</h3>{catalog?.budgets.map(b => <p key={b.project_id}>{catalog.projects.find(p => p.id === b.project_id)?.name ?? b.project_id}: available {usd((BigInt(b.limit_minor) - BigInt(b.spent_minor) - BigInt(b.reserved_minor)).toString())}, held {usd(b.reserved_minor)}, spent {usd(b.spent_minor)}</p>)}
      </section>
      {identity.capabilities.includes('request:submit') && <section><h2>Propose a purchase</h2><form onSubmit={e => { e.preventDefault(); void run(async () => {
        if (!agent?.project_id || !source) throw new Error('Choose an assigned agent and an authorized source.');
        const result = await api.call<SpendRequest>('/requests', { agentId, projectId: agent.project_id, merchantId, amountMinor: minorUnits(amount), currency: 'USD', category, purpose, source }, `submit:${action.current}`);
        await detail(result.id); await refresh(); setNotice('Request recorded. Independent finance consent is required.');
      }); }}>
        <label>Assigned Gatekeeper<select aria-label="Assigned Gatekeeper" value={agentId} onChange={e => setAgentId(e.target.value)} required><option value="">Select agent</option>{catalog?.agents.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
        <label>Merchant<select aria-label="Merchant" value={merchantId} onChange={e => setMerchantId(e.target.value)} required><option value="">Select merchant</option>{catalog?.merchants.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
        <label>Amount in USD<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required /></label><label>Category<select value={category} onChange={e => setCategory(e.target.value as Proposal['category'])}><option value="diagnostics">Diagnostics</option><option value="incident_response">Incident response</option></select></label><label>Purpose<textarea aria-label="Purpose" value={purpose} maxLength={1000} onChange={e => setPurpose(e.target.value)} required /></label>
        <label>Search imported evidence<input value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={200} /></label><button type="button" disabled={busy} onClick={() => void run(async () => setSources((await api.call<{ items: typeof sources }>(`/sources/search?q=${encodeURIComponent(query)}`)).items))}>Search sources</button>
        <label>Authorized source<select aria-label="Authorized source" value={source ? `${source.domain}:${source.sourceId}` : ''} onChange={e => { const found = sources.find(s => `${s.domain}:${s.source_id}` === e.target.value); setSource(found ? { domain: found.domain, sourceId: found.source_id } : null); }} required><option value="">Select exact source</option>{sources.map(s => <option key={`${s.domain}:${s.source_id}`} value={`${s.domain}:${s.source_id}`}>{s.domain}, {s.source_id}</option>)}</select></label>
        <button type="button" disabled={busy || !source} onClick={() => void run(async () => setSourceDetail(await api.call(`/sources/detail?domain=${source!.domain}&sourceId=${encodeURIComponent(source!.sourceId)}`)))}>Read source</button><Facts title="Source content and hashes" value={sourceDetail} /><button disabled={busy}>Submit sandbox request</button><button type="button" disabled={busy} onClick={() => { action.current = crypto.randomUUID(); setNotice('New logical request started. Only do this after recovering any uncertain submission.'); }}>Start a separate request</button>
      </form></section>}
      <section><h2>Recent scoped requests</h2><p>Latest 50; select a request to retrieve authoritative details.</p>{requests.length === 0 && <p>No requests yet.</p>}{requests.map(r => <button disabled={busy} key={r.id} onClick={() => void run(async () => { resetPreview(); await detail(r.id); })}>{r.proposal.purpose}, {usd(r.proposal.amountMinor)}, {r.workflowStatus}</button>)}
        {identity.role === 'FINANCE' && <button disabled={busy} onClick={() => void run(async () => { const page = await api.call<{ items: { id: string }[]; nextCursor: string | null }>('/approvals'); setNotice(`${page.items.length} pending reviews${page.nextCursor ? ' (more available)' : ''}.`); if (page.items[0]) { resetPreview(); await detail(page.items[0].id); } })}>Open pending finance review</button>}
      </section>
      {current && <section><h2>Request {current.id}</h2><p>{current.proposal.purpose}, {usd(current.proposal.amountMinor)}</p><p>Workflow: {current.workflowStatus}, Policy: {current.policyVerdict}, Consent: {current.consentStatus}, Authorization: {current.authorizationStatus}</p>
        <button disabled={busy} onClick={() => void run(async () => { await detail(current.id); await refresh(); })}>Refresh outcome</button>
        <Facts title="Evidence and citations" value={current.evidence} /><Facts title="Deterministic policy evaluation" value={current.decision} />
        {current.permittedActions.includes('PREVIEW_CONSENT') && <button disabled={busy} onClick={() => void run(async () => { resetPreview(); const next = await api.call<Preview>(`/requests/${current.id}/preview`, {}, `preview:${current.id}:${current.version}`); await detail(current.id); setPreview(next); })}>Generate exact consent preview</button>}
        {preview && <form onSubmit={e => e.preventDefault()}><h3>Review exact purchase</h3><p>{usd(preview.proposal.amountMinor)} USD → {preview.destinationRef}</p><p>Purpose: {preview.proposal.purpose}</p><Facts title="Exact proposal for consent" value={preview.proposal} /><p>Expires: {preview.expiresAt}, {expired ? 'Expired — generate a fresh preview' : 'Current preview'}</p><Facts title="Consent hash and version" value={{ previewHash: preview.previewHash, expectedVersion: preview.expectedVersion }} />
          {required.map(code => <label key={code}><input type="checkbox" checked={resolutions.includes(code)} onChange={e => setResolutions(e.target.checked ? [...resolutions, code] : resolutions.filter(c => c !== code))} />Explicitly resolve {code}</label>)}
          <label>Finance reason<textarea aria-label="Finance reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} required /></label>
          {(['approve','reject'] as const).map(choice => <button key={choice} disabled={busy || expired || !reason.trim() || (choice === 'approve' && (!preview.decision.executionAllowed || required.some(c => !resolutions.includes(c))))} onClick={() => void run(async () => {
            await api.call(`/requests/${current.id}/consent`, { choice, previewId: preview.id, previewHash: preview.previewHash, expectedVersion: preview.expectedVersion, reason, reviewResolutions: resolutions }, `consent:${preview.id}`);
            resetPreview(); await detail(current.id); await refresh(); setNotice(choice === 'approve' ? 'Consent recorded. Waiting for the worker; payment is not yet confirmed.' : 'Request rejected.');
          })}>{choice === 'approve' ? 'Authorize exact sandbox purchase' : 'Reject purchase'}</button>)}
        </form>}
        {current.permittedActions.includes('CANCEL') && <button disabled={busy} onClick={() => void run(async () => { await api.call(`/requests/${current.id}/cancel`, {}, `cancel:${current.id}`); resetPreview(); await detail(current.id); await refresh(); })}>Cancel before dispatch</button>}
        {current.permittedActions.includes('RECONCILE') && current.payment && <button disabled={busy} onClick={() => void run(async () => { await api.call(`/payments/${current.payment!.id}/reconcile`, {}, `reconcile:${current.payment!.id}`); await detail(current.id); await refresh(); })}>Reconcile existing payment</button>}
        <Facts title="Sandbox payment and receipt — no money moved" value={current.payment} /><Facts title="Audit timeline" value={events} />
      </section>}
    </>}
  </main>;
}

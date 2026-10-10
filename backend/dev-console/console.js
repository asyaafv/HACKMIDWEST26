/** This UI displays server decisions; it never authorizes or simulates payments locally. */
import { Api, cents, dollars } from './client.js';
const api = new Api();
const $ = id => document.getElementById(id);
const show = (id, value) => { $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
let active = false, allowedActions = [], lastState;
let identity, selected, exactPreview, pending = false, proposalAction = crypto.randomUUID();
let previewAction, previewPending = false;
function invalidate() { exactPreview = undefined; $('approve').disabled = true; $('reject').disabled = true; show('expiry', 'Refresh the exact preview before deciding.'); }
async function run(button, operation) {
  if (pending) return;
  pending = true; if (button) button.disabled = true;
  show('message', 'Waiting for the real backend…');
  try { await operation(); show('message', 'Backend response received.'); }
  catch (error) { show('message', error.message); if (['STALE_PREVIEW','STALE_EVIDENCE'].includes(error.code)) invalidate(); }
  finally { pending = false; if (button) button.disabled = false; updateConsent(); }
}
function options(id, rows, label) { $(id).replaceChildren(...rows.map(row => { const o = document.createElement('option'); o.value = row.id; o.textContent = label(row); return o; })); }
async function catalog() {
  const data = await api.call('/catalog');
  options('agent', data.agents, x => x.name ?? x.id); options('project', data.projects, x => x.name ?? x.id); options('merchant', data.merchants, x => `${x.name} · ${x.status}`);
  show('balances', data.budgets.map(b => ({ project: b.project_id, limit: dollars(b.limit_minor), spent: dollars(b.spent_minor), held: dollars(b.reserved_minor), available: dollars((BigInt(b.limit_minor)-BigInt(b.spent_minor)-BigInt(b.reserved_minor)).toString()) })));
}
async function refreshList() { const data = await api.call('/requests'); options('requests', data.items, r => `${r.id} · ${dollars(r.proposal.amountMinor)} · ${r.workflowStatus}`); await catalog(); }
function proposal() {
  const source = JSON.parse($('source').value);
  return { agentId: $('agent').value, projectId: $('project').value, merchantId: $('merchant').value, amountMinor: cents($('amount').value), currency: 'USD', category: $('category').value, purpose: $('purpose').value, source };
}
async function open(id, polling = false) {
  if (selected !== id) invalidate(); selected = id; $('request-id').value = id;
  const request = await api.call(`/requests/${id}`);
  const state = JSON.stringify(request);
  if (polling && state === lastState) return;
  lastState = state;
  if (exactPreview && (request.version !== exactPreview.expectedVersion || request.workflowStatus !== 'AWAITING_CONSENT')) invalidate();
  allowedActions = request.permittedActions ?? [];
  $('preview').disabled = !allowedActions.includes('PREVIEW_CONSENT');
  $('cancel').disabled = !allowedActions.includes('CANCEL');
  active = ['AUTHORIZED', 'EXECUTING', 'RECONCILING', 'COLLECTING'].includes(request.workflowStatus);
  show('detail', request); show('outcome', { workflowStatus: request.workflowStatus, policyVerdict: request.decision?.verdict, consentStatus: request.consentStatus ?? 'See authenticated consent events', payment: request.payment, mode: 'sandbox', receiptLabel: 'SIMULATED RECEIPT' });
  $('reconcile').disabled = !request.payment || !allowedActions.includes('RECONCILE');
  $('reconcile').dataset.payment = request.payment?.id ?? '';
  $('citations').replaceChildren();
  for (const item of request.evidence?.items ?? []) {
    const b = document.createElement('button'); b.textContent = `Source: ${item.sourceId ?? item.source_id ?? item.id}`;
    b.onclick = () => run(b, async () => show('source-detail', await api.call(`/sources/detail?domain=${encodeURIComponent(item.domain)}&sourceId=${encodeURIComponent(item.sourceId ?? item.source_id)}`)));
    $('citations').append(b);
  }
  if (request.payment) show('payment-detail', await api.call(`/payments/${request.payment.id}`)); else show('payment-detail', 'No payment exists.');
  show('events', await api.call(`/requests/${id}/events`)); show('explanation', await api.call(`/requests/${id}/explanation`)); await catalog();
}
function updateConsent() {
  $('preview').disabled = pending || !allowedActions.includes('PREVIEW_CONSENT');
  $('cancel').disabled = pending || !allowedActions.includes('CANCEL');
  const valid = !pending && identity?.role === 'FINANCE' && exactPreview && Date.parse(exactPreview.expiresAt) > Date.now();
  $('approve').disabled = !valid || !exactPreview?.decision?.executionAllowed;
  $('reject').disabled = !valid;
  if (exactPreview) show('expiry', Date.parse(exactPreview.expiresAt) > Date.now() ? `Exact preview expires ${exactPreview.expiresAt}` : 'Preview expired. Generate a fresh preview.');
}
$('connect-form').onsubmit = e => { e.preventDefault(); run(e.submitter, async () => { api.clear(); api.token = $('token').value; $('token').value = ''; identity = undefined; invalidate(); identity = await api.call('/me'); show('identity', identity); $('fault-controls').hidden = identity.role !== 'ADMIN'; await refreshList(); show('ready', await api.call('/integrations')); }); };
function disconnect() { api.clear(); identity = undefined; selected = undefined; allowedActions = []; lastState = undefined; proposalAction = crypto.randomUUID(); invalidate(); for (const id of ['identity','ready','detail','events','explanation','outcome','balances','source-detail','advice','preview-detail','queue-detail','payment-detail']) show(id, 'Disconnected'); for (const id of ['requests','agent','project','merchant','source','citations']) $(id).replaceChildren(); $('fault-controls').hidden = true; $('token').value = ''; $('reason').value = ''; $('reconcile').disabled = true; };
$('logout').onclick = disconnect;
$('login-form').onsubmit = e => { e.preventDefault(); run(e.submitter, async () => { api.clear(); invalidate(); const result = await api.call('/auth/login', { username: $('username').value, password: $('password').value }); $('password').value = ''; api.csrf = result.csrfToken; identity = await api.call('/me'); show('identity', identity); $('fault-controls').hidden = identity.role !== 'ADMIN'; await refreshList(); show('ready', await api.call('/integrations')); }); };
$('session-logout').onclick = e => run(e.target, async () => { await api.call('/auth/logout', {}); disconnect(); });
$('readiness').onclick = e => run(e.target, async () => show('ready', await api.call('/integrations')));
$('search').onclick = e => run(e.target, async () => { const data = await api.call(`/sources/search?q=${encodeURIComponent($('query').value)}`); $('source').replaceChildren(...data.items.map(s => { const o = document.createElement('option'); o.value = JSON.stringify({ domain: s.domain, sourceId: s.source_id ?? s.sourceId }); o.textContent = `${s.domain}: ${s.source_id ?? s.sourceId} · ${s.dataset_label ?? s.datasetVersion}`; return o; })); });
$('advisory').onclick = e => run(e.target, async () => show('advice', await api.call('/policy/preview', proposal())));
$('new-proposal').onclick = () => { proposalAction = crypto.randomUUID(); show('message', 'New logical proposal key created. Inspect any previous uncertain proposal before submitting another.'); };
$('proposal-form').onsubmit = e => { e.preventDefault(); run(e.submitter, async () => { const r = await api.call('/requests', proposal(), `proposal:${proposalAction}`); await refreshList(); await open(r.id); }); };
$('refresh').onclick = e => run(e.target, refreshList);
$('requests').onchange = e => run(null, () => open(e.target.value));
$('open-form').onsubmit = e => { e.preventDefault(); run(e.submitter, () => open($('request-id').value)); };
$('queue').onclick = e => run(e.target, async () => show('queue-detail', await api.call('/approvals')));
$('preview').onclick = e => run(e.target, async () => {
  if (!selected) throw new Error('Open a request first.');
  if (!previewPending) { previewAction = crypto.randomUUID(); previewPending = true; }
  const p = await api.call(`/requests/${selected}/preview`, {}, `preview:${selected}:${previewAction}`);
  previewPending = false; exactPreview = p; show('preview-detail', p);
  $('resolutions').replaceChildren(); const legend = document.createElement('legend'); legend.textContent = 'Explicit review resolutions'; $('resolutions').append(legend);
  for (const r of p.decision.reviewRequirements.filter(r => r.resolution === 'HUMAN_JUDGMENT')) {
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = r.code; label.append(input, document.createTextNode(r.code)); $('resolutions').append(label);
  }
  $('approve').textContent = `Authorize ${dollars(p.proposal.amountMinor)} sandbox purchase`;
});
$('consent-form').onsubmit = e => { e.preventDefault(); const choice = e.submitter.value; run(e.submitter, async () => {
  if (!exactPreview || Date.parse(exactPreview.expiresAt) <= Date.now()) throw new Error('Refresh expired preview.');
  const p = exactPreview;
  await api.call(`/requests/${selected}/consent`, { choice, previewId: p.id, previewHash: p.previewHash, expectedVersion: p.expectedVersion, reason: $('reason').value, reviewResolutions: [...$('resolutions').querySelectorAll('input:checked')].map(x => x.value) }, `consent:${p.id}`);
  invalidate(); await open(selected);
}); };
$('cancel').onclick = e => run(e.target, async () => { if (!selected) throw new Error('Open a request first.'); await api.call(`/requests/${selected}/cancel`, {}, `cancel:${selected}`); invalidate(); await open(selected); });
$('reconcile').onclick = e => run(e.target, async () => { const id = e.target.dataset.payment; await api.call(`/payments/${id}/reconcile`, {}, `reconcile:${id}`); await open(selected); });
$('fault').onclick = e => run(e.target, async () => { const id = $('reconcile').dataset.payment; if (!id) throw new Error('Open an authorized payment first.'); const mode = $('fault-mode').value; await api.call(`/payments/${id}/fault`, { mode }, `fault:${id}:${mode}`); await open(selected); });
setInterval(updateConsent, 1000);
setInterval(() => { if (!document.hidden && identity && selected && active && !pending) run(null, () => open(selected, true)); }, 10000);

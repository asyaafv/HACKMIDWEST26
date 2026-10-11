/** Adapts scoped PostgreSQL responses to the existing dashboard; no demo evaluation or payments. */
import { LiveApi, type Preview, type Proposal } from './live-api';
import { merchants as artwork } from './data';
import type { AuditEvent, DemoDataService, DemoState, GatekeeperInput, PolicyKind, RequestInput, Settings, Transaction, Merchant, Evidence } from './types';
export const api = new LiveApi();
interface Catalog {
 agents: { id: string; name: string; active: boolean; project_id: string; owner_id: string; cap_minor: string; created_at?: string }[];
 projects: { id: string; name: string }[]; merchants: { id: string; name: string; status: string }[];
 budgets: { project_id: string; limit_minor: string; spent_minor: string; reserved_minor: string }[];
 policy: { version: string; automaticMaxMinor: string; dailyMaxMinor: string; dailyMaxRequests: number; reviewScoreThreshold: number; ttlSeconds: number };
}
interface RecordRow {
 id: string; version: number; createdAt: string; proposal: Proposal; workflowStatus: string; consentStatus: string; authorizationStatus: string;
 decision: { verdict: string; riskScore: number; policyVersion: string; rules: { code: string; result: string; actual?: string; threshold?: string }[]; factors: { code: string; points: number }[]; reviewRequirements: { code: string; resolution: string }[] };
 evidence: { items: { id: string; domain: string; sourceId: string; content: Record<string, unknown>; sourceHash: string }[]; missing: string[]; links: unknown[]; bundleHash: string };
 payment: unknown;
}
export class BackendService implements DemoDataService {
  private created: { signature: string; action: string; id?: string } | null = null;
  private settings: Settings | null = null;
  async load(): Promise<DemoState> {
    const [me, dashboard] = await Promise.all([
      api.call<{ id: string; orgId: string; role: string; capabilities: string[] }>('/me'),
      api.call<{ catalog: Catalog; requests: RecordRow[]; events: { sequence: string; packet: { resourceId: string; event: string; actorId: string; details: unknown; createdAt: string } }[] }>('/dashboard'),
    ]);
    const c = dashboard.catalog;
    const merchants: Merchant[] = c.merchants.map(m => ({ id: m.id, name: m.name, category: m.status, domain: '', logo: artwork.find(a => a.name.toLowerCase() === m.name.toLowerCase())?.logo }));
    // Historical requests can retain merchants omitted from the current catalog.
    for (const r of dashboard.requests) if (!merchants.some(m => m.id === r.proposal.merchantId)) merchants.push({id:r.proposal.merchantId,name:r.proposal.merchantId,category:'Historical vendor',domain:''});
    const transactions: Transaction[] = dashboard.requests.map(r => ({
      id: r.id, agentId: r.proposal.agentId, merchantId: r.proposal.merchantId, amount: Number(r.proposal.amountMinor), priority: 'P2',
      decision: ['REJECTED','CANCELLED','EXPIRED'].includes(r.workflowStatus) || r.decision.verdict === 'REJECT' ? 'Blocked' : r.consentStatus === 'GRANTED' ? 'Approved' : 'Pending',
      risk: r.decision.riskScore, createdAt: r.createdAt, purpose: r.proposal.purpose, project: c.projects.find(p => p.id === r.proposal.projectId)?.name ?? r.proposal.projectId,
      paymentMethod: 'Enterprise review only', workflowStatus: r.workflowStatus, policyVerdict: r.decision.verdict, authorizationStatus: r.authorizationStatus,
      backend: r, historicalPayment:r.payment, analysis: {factors:r.decision.factors,missing:r.evidence.missing,policyVersion:r.decision.policyVersion,links:r.evidence.links}, evidence: r.evidence.items.map((e): Evidence => ({ id: e.id, title: String(e.content.title ?? e.sourceId), subtitle: `${e.domain} · ${e.sourceId}`, kind: 'request', text: JSON.stringify(e.content, null, 2), sourceId: e.sourceId, domain: e.domain, sourceHash: e.sourceHash })),
      checks: r.decision.rules.map(rule => ({ id: 'purpose' as const, name: rule.code.replaceAll('_',' '), detail: `${rule.result}${rule.actual ? ` · actual ${rule.actual}` : ''}${rule.threshold ? ` · threshold ${rule.threshold}` : ''}`, passed: rule.result === 'PASS', version: 1 })),
    }));
    // Portraits are deterministic presentation choices, not agent trust or risk data.
    const agents = c.agents.map((a, i) => ({ id: a.id, name: a.name, description: `Assigned project: ${c.projects.find(p => p.id === a.project_id)?.name ?? a.project_id}. Request cap: ${a.cap_minor} USD cents.`, department: c.projects.find(p => p.id === a.project_id)?.name ?? 'Assigned project', avatar: i % 10 + 1, active: a.active, createdAt: a.created_at ?? '', projectId: a.project_id, ownerId: a.owner_id }));
    for (const t of transactions) if (!agents.some(a => a.id === t.agentId)) agents.push({ id: t.agentId, name: t.agentId, description: 'Historical agent; not present in the current scoped catalog.', department: 'Historical', avatar: 1, active: false, createdAt: '', projectId: '', ownerId: '' });
    const events: AuditEvent[] = dashboard.events.map(e => ({ id: e.sequence, type: /review|consent/.test(e.packet.event) ? 'decision' : 'request', title: e.packet.event.replaceAll('.',' '), detail: JSON.stringify(e.packet.details), createdAt: e.packet.createdAt, actor: e.packet.actorId ?? 'Backend', transactionId: e.packet.resourceId }));
    const settings = this.settings ?? { name: me.role, initials: me.role.slice(0,2), workspace: 'Gate workspace', notifications: true, compact: false };
    return { version: 1, agents, merchants, transactions, policies: [], events, settings, identity: me, catalog: c, bounded: true };
  }
  async createRequest(input: RequestInput) {
    if (!input.source || !input.project) throw new Error('Select an authorized project and source.');
    const body = { agentId: input.agentId, projectId: input.project, merchantId: input.merchantId, amountMinor: String(input.amount), currency: 'USD', category: input.category ?? 'diagnostics', purpose: input.purpose, source: input.source };
    const signature = JSON.stringify(body);
    if (this.created && this.created.signature !== signature) throw new Error('Recover the previous submission or start a new request form before changing an uncertain action.');
    this.created ??= { signature, action: crypto.randomUUID() };
    const result = await api.call<{ id: string }>('/requests', body, this.created.action); this.created.id = result.id;
    const state = await this.load(); state.transactions.sort((a,b) => a.id === result.id ? -1 : b.id === result.id ? 1 : 0); return state;
  }
  newRequest() { this.created = null; }
  async decideRequest(): Promise<DemoState> { throw new Error('Review requires a fresh, version-bound backend preview.'); }
  async review(id: string, preview: Preview, choice: 'approve' | 'reject', reason: string, reviewResolutions: string[]) {
    await api.call(`/requests/${id}/review`, { choice, previewId: preview.id, previewHash: preview.previewHash, expectedVersion: preview.expectedVersion, reason, reviewResolutions }, `review:${preview.id}`);
    return this.load();
  }
  async createGatekeeper(_input: GatekeeperInput): Promise<DemoState> { throw new Error('Gatekeepers are provisioned through the backend identity tools.'); }
  async updateGatekeeper(_id: string, _input: GatekeeperInput): Promise<DemoState> { throw new Error('Gatekeeper configuration is read-only.'); }
  async setGatekeeperActive(_id: string, _active: boolean): Promise<DemoState> { throw new Error('Gatekeeper configuration is read-only.'); }
  async updatePolicy(_id: PolicyKind, _input: unknown): Promise<DemoState> { throw new Error('Policy editing is not available in the backend.'); }
  async updateSettings(input: Settings) { this.settings = input; return this.load(); }
  async reset(): Promise<DemoState> { throw new Error('Resetting database records is not a dashboard action.'); }
}

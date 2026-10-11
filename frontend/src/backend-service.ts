/** Maps stored transactions and their independent Gate reviews into the main dashboard. */
import { LiveApi, type Proposal } from './live-api';
import { merchants as artwork } from './data';
import type { AuditEvent, DemoDataService, DemoState, GatekeeperInput, PolicyKind, RequestInput, Settings, Transaction, Merchant, Evidence, Investigation, RiskAssessment } from './types';
export const api = new LiveApi();
interface Catalog {
 agents: { id: string; name: string; active: boolean; project_id: string; owner_id: string; cap_minor: string; can_purchase?:boolean; created_at?: string }[];
 projects: { id: string; name: string }[]; merchants: { id: string; name: string; status: string }[];
 budgets: { project_id: string; limit_minor: string; spent_minor: string; reserved_minor: string }[];
 policy: { version: string; automaticMaxMinor: string; dailyMaxMinor: string; dailyMaxRequests: number; reviewScoreThreshold: number; ttlSeconds: number };
}
interface RecordRow {
 id: string; version: number; origin?: string; createdAt: string; proposal: Proposal; workflowStatus: string; consentStatus: string; authorizationStatus: string;
 decision: { verdict: string; riskScore: number; riskAssessment?:RiskAssessment;policyVersion: string; rules: { code: string; result: string; actual?: string; threshold?: string }[]; factors: { code: string; points: number }[]; reviewRequirements: { code: string; resolution: string }[] };
 evidence: { items: { id: string; domain: string; sourceId: string; content: Record<string, unknown>; sourceHash: string }[]; missing: string[]; links: unknown[]; bundleHash: string; complete?:boolean; investigation?:{report:{unresolvedQuestions:string[]}} };
 payment: unknown; snapshotHash: string; transactionReview: null | { choice: string; reason: string; request_version?:number }; investigation?:Investigation|null;
}
export class BackendService implements DemoDataService {
  private investigationActions=new Map<string,{expectedVersion:number;action:string}>();
  private created: { signature: string; action: string; id?: string } | null = null;
  private settings: Settings | null = null;
  async load(): Promise<DemoState> {
    const dashboard = await api.call<{ identity: {id:string;orgId:string;role:string;capabilities:string[]}; catalog: Catalog; requests: RecordRow[]; events: { sequence: string; packet: { resourceId: string; event: string; actorId: string; details: unknown; createdAt: string } }[] }>('/demo/dashboard');
    const me = dashboard.identity;
    const c = dashboard.catalog;
    const merchants: Merchant[] = c.merchants.map(m => ({ id: m.id, name: m.name, category: m.status, domain: '', logo: artwork.find(a => a.name.toLowerCase() === m.name.toLowerCase())?.logo }));
    // Historical requests can retain merchants omitted from the current catalog.
    for (const r of dashboard.requests) if (!merchants.some(m => m.id === r.proposal.merchantId)) merchants.push({id:r.proposal.merchantId,name:r.proposal.merchantId,category:'Historical vendor',domain:''});
    const transactions: Transaction[] = dashboard.requests.map(r => {
      const review=r.transactionReview&&((r.transactionReview.request_version??r.version)===r.version)&&(!r.investigation||r.payment||r.investigation.status==='EVALUATED')?r.transactionReview:null;
      return ({
      simulated: r.origin === 'SIMULATED_PURCHASE', id: r.id, agentId: r.proposal.agentId, merchantId: r.proposal.merchantId, amount: Number(r.proposal.amountMinor), priority: 'P2',
      decision: r.decision.verdict === 'REJECT' || r.workflowStatus === 'REJECTED' ? 'Blocked' : review?.choice === 'reject' ? 'Blocked' : r.decision.verdict === 'APPROVE' || ['AUTHORIZED','EXECUTING','COMPLETED','RECONCILING'].includes(r.workflowStatus) || review?.choice === 'approve' ? 'Approved' : 'Pending',
      reason: review?.reason, investigation:r.payment?null:r.investigation,canApprove:!r.investigation||!!r.payment||(r.evidence.complete!==false&&r.decision.verdict!=='REJECT'),unresolvedQuestions:r.evidence.investigation?.report.unresolvedQuestions,previousReview:!review&&r.transactionReview?r.transactionReview:undefined, reviewBinding: {version:r.version,snapshotHash:r.snapshotHash},
      risk: r.decision.riskScore, riskAssessment:r.decision.riskAssessment,createdAt: r.createdAt, purpose: r.proposal.purpose, project: c.projects.find(p => p.id === r.proposal.projectId)?.name ?? r.proposal.projectId,
      category: r.proposal.category, source: r.proposal.source, reviewRequirements: r.decision.reviewRequirements,
      paymentMethod: r.payment ? 'Existing PostgreSQL payment' : 'Stored transaction request', workflowStatus: r.workflowStatus, policyVerdict: r.decision.verdict, authorizationStatus: r.authorizationStatus !== 'NONE' ? r.authorizationStatus : review ? 'REVIEWED' : r.workflowStatus === 'AWAITING_CONSENT' ? 'AWAITING_REVIEW' : 'NONE',
      backend: r, historicalPayment:r.payment, analysis: {factors:r.decision.factors,missing:r.evidence.missing,policyVersion:r.decision.policyVersion,links:r.evidence.links}, evidence: r.evidence.items.map((e): Evidence => ({ id: e.id, title: String(e.content.title ?? e.sourceId), subtitle: `${e.domain} · ${e.sourceId}`, kind: 'request', text: JSON.stringify(e.content, null, 2), sourceId: e.sourceId, domain: e.domain, sourceHash: e.sourceHash })),
      checks: r.decision.rules.map(rule => ({ id: 'purpose' as const, name: rule.code.replaceAll('_',' '), detail: `${rule.result}${rule.actual ? ` · actual ${rule.actual}` : ''}${rule.threshold ? ` · threshold ${rule.threshold}` : ''}`, passed: rule.result === 'PASS', version: 1 })),
    });});
    // Portraits are deterministic presentation choices, not agent trust or risk data.
    const agents = c.agents.map((a, i) => ({ id: a.id, name: a.name, description: `Assigned project: ${c.projects.find(p => p.id === a.project_id)?.name ?? a.project_id}. Request cap: ${a.cap_minor} USD cents.`, department: c.projects.find(p => p.id === a.project_id)?.name ?? 'Assigned project', avatar: i % 10 + 1, active: a.active, createdAt: a.created_at ?? '', projectId: a.project_id, ownerId: a.owner_id,canPurchase:a.can_purchase??true }));
    for (const t of transactions) if (!agents.some(a => a.id === t.agentId)) agents.push({ id: t.agentId, name: t.agentId, description: 'Historical agent; not present in the current scoped catalog.', department: 'Historical', avatar: 1, active: false, createdAt: '', projectId: '', ownerId: '',canPurchase:false });
    const events: AuditEvent[] = dashboard.events.map(e => ({ id: e.sequence, type: /review|consent|transaction\.(approved|rejected)/.test(e.packet.event) ? 'decision' : 'request', title: e.packet.event.replaceAll('.',' '), detail: JSON.stringify(e.packet.details), createdAt: e.packet.createdAt, actor: e.packet.actorId ?? 'Backend', transactionId: e.packet.resourceId }));
    const settings = this.settings ?? { name: me.role, initials: me.role.slice(0,2), workspace: 'Gate workspace', notifications: true, compact: false };
    return { version: 1, agents, merchants, transactions, policies: [], events, settings, identity: me, catalog: c, bounded: true };
  }
  async createRequest(input: RequestInput) {
    if (!input.source || !input.project) throw new Error('Select an authorized project and source.');
    const body = { agentId: input.agentId, projectId: input.project, merchantId: input.merchantId, amountMinor: String(input.amount), currency: 'USD', category: input.category ?? 'diagnostics', purpose: input.purpose, source: input.source };
    const signature = JSON.stringify(body);
    if (this.created && this.created.signature !== signature) throw new Error('Recover the previous submission or start a new request form before changing an uncertain action.');
    this.created ??= { signature, action: crypto.randomUUID() };
    const result = await api.call<{ id: string }>('/demo/purchases', body, this.created.action); this.created.id = result.id;
    const state = await this.load(); state.transactions.sort((a,b) => a.id === result.id ? -1 : b.id === result.id ? 1 : 0); return state;
  }
  newRequest() { this.created = null; }
  async decideRequest(): Promise<DemoState> { throw new Error('Review requires a fresh, version-bound backend preview.'); }
  async investigate(transaction:Transaction) {
    let action=this.investigationActions.get(transaction.id);
    if(action&&transaction.investigation?.status==='INVESTIGATING'&&transaction.investigation.lease_until&&Date.parse(transaction.investigation.lease_until)<=Date.now()){this.investigationActions.delete(transaction.id);action=undefined;}
    if(!action){action={expectedVersion:transaction.reviewBinding!.version,action:crypto.randomUUID()};this.investigationActions.set(transaction.id,action);}
    await api.call(`/demo/transactions/${transaction.id}/investigation`,{expectedVersion:action.expectedVersion},action.action);
    const next=await this.load();this.investigationActions.delete(transaction.id);return next;
  }
  async reviewTransaction(transaction: Transaction, choice: 'approve'|'reject', reason: string, action: string) {
    if (!transaction.reviewBinding) throw new Error('Refresh this transaction before reviewing it.');
    await api.call(`/demo/transactions/${transaction.id}/review`, {choice,reason,expectedVersion:transaction.reviewBinding.version,snapshotHash:transaction.reviewBinding.snapshotHash},action);
    return this.load();
  }
  async createGatekeeper(_input: GatekeeperInput): Promise<DemoState> { throw new Error('Gatekeepers are provisioned through the backend identity tools.'); }
  async updateGatekeeper(_id: string, _input: GatekeeperInput): Promise<DemoState> { throw new Error('Gatekeeper configuration is read-only.'); }
  async setGatekeeperActive(_id: string, _active: boolean): Promise<DemoState> { throw new Error('Gatekeeper configuration is read-only.'); }
  async updatePolicy(_id: PolicyKind, _input: unknown): Promise<DemoState> { throw new Error('Policy editing is not available in the backend.'); }
  async updateSettings(input: Settings) { this.settings = input; return this.load(); }
  async reset(): Promise<DemoState> { throw new Error('Resetting database records is not a dashboard action.'); }
}

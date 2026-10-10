import { evaluate, evidenceFor, merchants, money, seed } from './data';
import type { AuditEvent, DemoDataService, DemoState, GatekeeperInput, PolicyKind, RequestInput, Settings } from './types';

export const STORAGE_KEY = 'gate.demo.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
function validateStoredState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const s = value as DemoState;
  const iso = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const str = (v: unknown) => typeof v === 'string';
  return s.version === 1 && Array.isArray(s.agents) && Array.isArray(s.transactions) && Array.isArray(s.policies) && Array.isArray(s.events)
    && s.agents.every(a => a && str(a.id) && str(a.name) && str(a.description) && str(a.department) && Number.isInteger(a.avatar) && a.avatar >= 1 && a.avatar <= 10 && typeof a.active === 'boolean' && iso(a.createdAt))
    && s.transactions.every(t => t && str(t.id) && s.agents.some(a => a.id === t.agentId) && merchants.some(m => m.id === t.merchantId) && Number.isSafeInteger(t.amount) && t.amount > 0 && ['P0', 'P1', 'P2'].includes(t.priority) && ['Approved', 'Pending', 'Blocked'].includes(t.decision) && Number.isFinite(t.risk) && str(t.purpose) && str(t.project) && str(t.paymentMethod) && iso(t.createdAt) && Array.isArray(t.evidence) && t.evidence.every(e => e && str(e.title) && str(e.subtitle) && str(e.text)) && Array.isArray(t.checks) && t.checks.every(c => c && str(c.name) && str(c.detail) && typeof c.passed === 'boolean'))
    && s.policies.length === 6 && ['vendors', 'budget', 'limit', 'purpose', 'categories', 'risk'].every(id => s.policies.some(p => p && p.id === id && str(p.name) && str(p.description) && typeof p.enabled === 'boolean' && (str(p.value) || Number.isFinite(p.value)) && Number.isInteger(p.version)))
    && s.events.every(e => e && str(e.id) && str(e.type) && str(e.title) && str(e.detail) && str(e.actor) && iso(e.createdAt))
    && !!s.settings && str(s.settings.name) && str(s.settings.initials) && str(s.settings.workspace) && typeof s.settings.notifications === 'boolean' && typeof s.settings.compact === 'boolean';
}

export class LocalDemoService implements DemoDataService {
  private state: DemoState | null = null;
  constructor(private storage: StoragePort) {}
  private save(next: DemoState): DemoState {
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('Your browser could not save this change. Free up storage or enable site storage, then try again.'); }
    this.state = next;
    return structuredClone(next);
  }
  async load(): Promise<DemoState> {
    if (this.state) return structuredClone(this.state);
    let raw: string | null;
    try { raw = this.storage.getItem(STORAGE_KEY); }
    catch { throw new Error('Site storage is unavailable. Enable storage for this site and try again.'); }
    if (raw === null) return this.save(seed());
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('Saved demo data could not be read. Reset the demo to restore its original records.'); }
    if (!validateStoredState(parsed)) throw new Error('Saved demo data has an unsupported format. Reset the demo to restore its original records.');
    this.state = parsed;
    return structuredClone(parsed);
  }
  private async mutate(change: (next: DemoState) => void): Promise<DemoState> {
    const next = await this.load();
    change(next);
    return this.save(next);
  }
  private event(state: DemoState, input: Omit<AuditEvent, 'id' | 'createdAt' | 'actor'>) {
    state.events.unshift({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), actor: state.settings.name });
  }
  private validateAgent(input: GatekeeperInput) {
    if (!input.name.trim() || input.name.trim().length > 60) throw new Error('Enter a Gatekeeper name of 1 to 60 characters.');
    if (!input.description.trim() || input.description.trim().length > 500) throw new Error('Enter a description of 1 to 500 characters.');
    if (!Number.isInteger(input.avatar) || input.avatar < 1 || input.avatar > 10) throw new Error('Choose one of the ten character portraits.');
    if (input.department.length > 60) throw new Error('Keep the department under 60 characters.');
  }
  async createGatekeeper(input: GatekeeperInput) {
    this.validateAgent(input);
    return this.mutate(s => {
      const agent = { ...input, name: input.name.trim(), description: input.description.trim(), department: input.department.trim() || 'general', id: crypto.randomUUID(), active: true, createdAt: new Date().toISOString() };
      s.agents.push(agent);
      this.event(s, { type: 'gatekeeper', title: `${agent.name} created`, detail: 'Gatekeeper added to this demo workspace.', agentId: agent.id });
    });
  }
  async updateGatekeeper(id: string, input: GatekeeperInput) {
    this.validateAgent(input);
    return this.mutate(s => {
      const a = s.agents.find(a => a.id === id); if (!a) throw new Error('This Gatekeeper could not be found.');
      Object.assign(a, { ...input, name: input.name.trim(), description: input.description.trim(), department: input.department.trim() || 'general' });
      this.event(s, { type: 'gatekeeper', title: `${a.name} updated`, detail: 'Name, description, department, and portrait saved.', agentId: id });
    });
  }
  async setGatekeeperActive(id: string, active: boolean) {
    return this.mutate(s => {
      const a = s.agents.find(a => a.id === id); if (!a) throw new Error('This Gatekeeper could not be found.');
      a.active = active;
      this.event(s, { type: 'gatekeeper', title: `${a.name} ${active ? 'resumed' : 'paused'}`, detail: active ? 'New requests are enabled.' : 'Existing history retained; new requests disabled.', agentId: id });
    });
  }
  async createRequest(input: RequestInput) {
    return this.mutate(s => {
      const agent = s.agents.find(a => a.id === input.agentId);
      if (!agent?.active) throw new Error('Choose an active Gatekeeper.');
      const merchant = merchants.find(m => m.id === input.merchantId);
      if (!merchant) throw new Error('Choose a listed demo merchant.');
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 100000000) throw new Error('Enter a USD amount between $0.01 and $1,000,000.');
      if (!input.purpose.trim() || input.purpose.length > 500 || !input.project.trim() || input.project.length > 100 || !['P0', 'P1', 'P2'].includes(input.priority)) throw new Error('Provide a business purpose, project, and valid priority.');
      const risk = merchant.id === 'giftcards' ? 94 : input.amount > 200000 ? 46 : 12;
      const checks = evaluate(input, s.policies, risk);
      const blocked = checks.some(c => !c.passed && ['vendors', 'budget', 'categories'].includes(c.id));
      const decision = blocked ? 'Blocked' : checks.every(c => c.passed) ? 'Approved' : 'Pending';
      const id = `REQ-${Math.max(1842, ...s.transactions.map(t => Number(t.id.slice(4)))) + 1}`;
      const budget = s.policies.find(p => p.id === 'budget')!;
      const evidence = evidenceFor(input, Number(budget.value)); evidence[1].title = id;
      evidence[0].subtitle = checks[0].passed ? 'Approved vendor' : 'Vendor review required';
      s.transactions.unshift({ ...input, purpose: input.purpose.trim(), project: input.project.trim(), id, risk, decision, checks, evidence, createdAt: new Date().toISOString(), paymentMethod: 'Corporate card (Flex)', reason: blocked ? checks.filter(c => !c.passed).map(c => c.detail).join('; ') : undefined });
      this.event(s, { type: 'request', title: `${id} created`, detail: `${merchant.name} · ${money(input.amount)} · ${decision} by demo policies`, transactionId: id, agentId: input.agentId });
    });
  }
  async decideRequest(id: string, decision: 'Approved' | 'Blocked', reason: string) {
    if (!reason.trim() || reason.length > 500) throw new Error('Add a decision reason of 1 to 500 characters.');
    return this.mutate(s => {
      const t = s.transactions.find(t => t.id === id);
      if (!t || t.decision !== 'Pending') throw new Error('Only pending requests can receive a review decision.');
      t.decision = decision; t.reason = reason.trim();
      this.event(s, { type: 'decision', title: `${id} ${decision.toLowerCase()}`, detail: reason.trim(), transactionId: id, agentId: t.agentId });
    });
  }
  async updatePolicy(id: PolicyKind, input: { enabled: boolean; value: number | string }) {
    return this.mutate(s => {
      const p = s.policies.find(p => p.id === id); if (!p) throw new Error('This policy could not be found.');
      if (typeof p.value === 'number' && (!Number.isSafeInteger(input.value) || Number(input.value) < 1 || (id === 'risk' && Number(input.value) > 100))) throw new Error(id === 'risk' ? 'Enter a whole risk score from 1 to 100.' : 'Enter a positive whole value.');
      if (typeof p.value === 'string' && (typeof input.value !== 'string' || !input.value.trim() || input.value.length > 500)) throw new Error('Provide a comma-separated list of values.');
      Object.assign(p, input); p.version++;
      this.event(s, { type: 'policy', title: `${p.name} updated`, detail: `Version ${p.version} saved. Applies to future requests only.` });
    });
  }
  async updateSettings(input: Settings) {
    if (!input.name.trim() || input.name.length > 80 || !input.workspace.trim() || input.workspace.length > 80 || !/^[A-Za-z0-9]{1,3}$/.test(input.initials)) throw new Error('Provide a name and workspace, with 1 to 3 letters or numbers for initials.');
    return this.mutate(s => { s.settings = { ...input, name: input.name.trim(), workspace: input.workspace.trim(), initials: input.initials.toUpperCase() }; this.event(s, { type: 'settings', title: 'Workspace settings updated', detail: 'Profile and local demo preferences saved.' }); });
  }
  async reset() { return this.save(seed()); }
}

export type Decision = 'Approved' | 'Pending' | 'Blocked';
export type Priority = 'P0' | 'P1' | 'P2';
export type PolicyKind = 'vendors' | 'budget' | 'limit' | 'purpose' | 'categories' | 'risk';
export interface Gatekeeper { id: string; name: string; description: string; department: string; avatar: number; active: boolean; createdAt: string }
export interface Merchant { id: string; name: string; category: string; domain: string; logo?: string }
export interface Policy { id: PolicyKind; name: string; description: string; enabled: boolean; value: number | string; version: number }
export interface PolicyCheck { id: PolicyKind; name: string; detail: string; passed: boolean; version: number }
export interface Evidence { id: string; title: string; subtitle: string; kind: 'vendor' | 'request' | 'project' | 'budget' | 'purpose'; text: string }
export interface Transaction {
  id: string; agentId: string; merchantId: string; amount: number; priority: Priority;
  decision: Decision; risk: number; createdAt: string; purpose: string; project: string;
  paymentMethod: string; evidence: Evidence[]; checks: PolicyCheck[]; reason?: string;
}
export interface AuditEvent { id: string; type: 'request' | 'decision' | 'gatekeeper' | 'policy' | 'settings'; title: string; detail: string; createdAt: string; actor: string; transactionId?: string; agentId?: string }
export interface Settings { name: string; initials: string; workspace: string; notifications: boolean; compact: boolean }
export interface DemoState { version: 1; agents: Gatekeeper[]; transactions: Transaction[]; policies: Policy[]; events: AuditEvent[]; settings: Settings }
export interface GatekeeperInput { name: string; description: string; department: string; avatar: number }
export interface RequestInput { agentId: string; merchantId: string; amount: number; priority: Priority; purpose: string; project: string }
export interface DemoDataService {
  load(): Promise<DemoState>;
  createGatekeeper(input: GatekeeperInput): Promise<DemoState>;
  updateGatekeeper(id: string, input: GatekeeperInput): Promise<DemoState>;
  setGatekeeperActive(id: string, active: boolean): Promise<DemoState>;
  createRequest(input: RequestInput): Promise<DemoState>;
  decideRequest(id: string, decision: Exclude<Decision, 'Pending'>, reason: string): Promise<DemoState>;
  updatePolicy(id: PolicyKind, input: Pick<Policy, 'enabled' | 'value'>): Promise<DemoState>;
  updateSettings(input: Settings): Promise<DemoState>;
  reset(): Promise<DemoState>;
}

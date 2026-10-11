/** Dashboard domain types keep financial state separate from Gate review state. */
export type Decision = 'Approved' | 'Pending' | 'Blocked';
export type Priority = 'P0' | 'P1' | 'P2';
export type PolicyKind = 'vendors' | 'budget' | 'limit' | 'purpose' | 'categories' | 'risk';
export interface Gatekeeper { id: string; name: string; description: string; department: string; avatar: number; active: boolean; createdAt: string; projectId?: string; ownerId?: string;canPurchase?:boolean }
export interface Merchant { id: string; name: string; category: string; domain: string; logo?: string }
export interface Policy { id: PolicyKind; name: string; description: string; enabled: boolean; value: number | string; version: number }
export interface PolicyCheck { id: PolicyKind; name: string; detail: string; passed: boolean; version: number }
export interface Evidence { id: string; title: string; subtitle: string; kind: 'vendor' | 'request' | 'project' | 'budget' | 'purpose'; text: string; sourceId?: string; domain?: string; sourceHash?: string }
export interface Investigation {status:'WAITING'|'INVESTIGATING'|'EVIDENCE_RECEIVED'|'EVALUATED'|'FAILED';mode:null|'LOCAL_TEST'|'GATEKEEPER';run_id:string|null;started_at:string|null;evidence_received_at:string|null;evaluated_at:string|null;lease_until:string|null;failure_reason:string|null}
export interface RiskAssessment { computedBy:'BACKEND_POLICY';modelVersion:string;scoreType:'RULE_POINTS';score:number;maximum:number;reviewThreshold:number;level:'LOW'|'REVIEW_REQUIRED'|'BLOCKED';lowRisk:boolean;summary:string }
export interface Transaction {
  riskAssessment?:RiskAssessment;
  canApprove?:boolean;investigation?:Investigation|null;unresolvedQuestions?:string[];previousReview?:{choice:string;reason:string};
  id: string; agentId: string; merchantId: string; amount: number; priority: Priority;
  decision: Decision; risk: number; createdAt: string; purpose: string; project: string;
  simulated?: boolean; category?: 'diagnostics'|'incident_response'; source?: {domain:'pm'|'crm'|'document';sourceId:string}; reviewRequirements?: {code:string;resolution:string}[];
  reviewBinding?: {version:number;snapshotHash:string};
  workflowStatus?: string; policyVerdict?: string; authorizationStatus?: string; backend?: unknown; historicalPayment?: unknown; analysis?: { factors: {code:string;points:number}[]; missing:string[]; policyVersion:string; links:unknown[] }; paymentMethod: string; evidence: Evidence[]; checks: PolicyCheck[]; reason?: string;
}
export interface AuditEvent { id: string; type: 'request' | 'decision' | 'gatekeeper' | 'policy' | 'settings'; title: string; detail: string; createdAt: string; actor: string; transactionId?: string; agentId?: string }
export interface Settings { name: string; initials: string; workspace: string; notifications: boolean; compact: boolean }
export interface DemoState { version: 1; agents: Gatekeeper[]; transactions: Transaction[]; policies: Policy[]; events: AuditEvent[]; settings: Settings; merchants?: Merchant[]; identity?: { id: string; role: string; orgId: string; capabilities: string[] }; catalog?: { projects: {id:string;name:string}[]; budgets: {project_id:string;limit_minor:string;spent_minor:string;reserved_minor:string}[]; policy: unknown }; bounded?: boolean }
export interface GatekeeperInput { name: string; description: string; department: string; avatar: number }
export interface RequestInput { agentId: string; merchantId: string; amount: number; priority: Priority; purpose: string; project: string; source?: { domain: 'pm'|'crm'|'document'; sourceId: string }; category?: 'diagnostics'|'incident_response' }
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

/** REST client for the live workspace; credentials and retry bindings stay in memory. */
export class LiveApi {
  token = '';
  csrf = '';
  private actions = new Map<string, { signature: string; key: string }>();
  clear() { this.token = ''; this.csrf = ''; this.actions.clear(); }
  async call<T>(path: string, body?: unknown, action?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined && this.csrf && !this.token) headers['X-CSRF-Token'] = this.csrf;
    if (action) {
      // A lost response must replay the same purchase, never generate a replacement.
      const signature = JSON.stringify([path, body]);
      const saved = this.actions.get(action);
      if (saved && saved.signature !== signature) throw new Error('Uncertain action: retry its original values before changing them.');
      if (!saved) this.actions.set(action, { signature, key: crypto.randomUUID() });
      headers['Idempotency-Key'] = this.actions.get(action)!.key;
    }
    let response: Response;
    try {
      response = await fetch(`/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers,
        credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new Error(action ? 'Response lost. Retry the identical action; its key is retained.' : 'Backend unavailable.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(`${result.error?.code ?? response.status}: ${result.error?.message ?? 'Request failed'}, trace ${result.meta?.traceId ?? 'unavailable'}`);
    return result.data as T;
  }
}
/** Parse decimal dollars using integer arithmetic; reject rounding and exponent formats. */
export function minorUnits(value: string) {
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value)) throw new Error('Enter positive USD with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount < 1n || amount > 99999999n) throw new Error('Amount exceeds sandbox limits.');
  return amount.toString();
}
export function usd(value: string) {
  const n = BigInt(value), sign = n < 0n ? '-' : '', absolute = n < 0n ? -n : n;
  return `${sign}$${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export interface Named { id: string; name: string; project_id?: string }
export interface Catalog { agents: Named[]; projects: Named[]; merchants: Named[]; budgets: { project_id: string; limit_minor: string; spent_minor: string; reserved_minor: string }[] }
export interface Proposal { agentId: string; projectId: string; merchantId: string; amountMinor: string; currency: 'USD'; category: 'diagnostics' | 'incident_response'; purpose: string; source: { domain: 'pm' | 'crm' | 'document'; sourceId: string } }
export interface Decision { verdict: string; executionAllowed: boolean; reviewRequirements: { code: string; resolution: string }[] }
export interface SpendRequest { id: string; version: number; proposal: Proposal; workflowStatus: string; policyVerdict: string; consentStatus: string; authorizationStatus: string; permittedActions: string[]; decision: Decision; evidence: unknown; payment: null | { id: string; status: string; holdState: string; receipt: unknown } }
export interface Preview { id: string; previewHash: string; expectedVersion: number; expiresAt: string; proposal: Proposal; destinationRef: string; decision: Decision }
export interface Identity { id: string; role: string; capabilities: string[] }

/** Exact money and retry bindings shared by the development console. */
export function cents(value) {
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value)) throw new Error('Enter positive USD with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount < 1n || amount > 99999999n) throw new Error('Amount exceeds sandbox limits.');
  return amount.toString();
}
export function dollars(value) {
  const n = BigInt(value); return `$${n / 100n}.${(n % 100n).toString().padStart(2, '0')}`;
}
export class Api {
  token = ''; csrf = ''; actions = new Map();
  clear() { this.token = ''; this.csrf = ''; this.actions.clear(); }
  async call(path, body, action) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined && this.csrf && !this.token) headers['X-CSRF-Token'] = this.csrf;
    if (action) {
      const signature = JSON.stringify([path, body]);
      const previous = this.actions.get(action);
      if (previous && previous.signature !== signature) throw new Error('This action has an uncertain result. Retry the original action or start a new action explicitly.');
      if (!previous) this.actions.set(action, { signature, key: crypto.randomUUID() });
      headers['Idempotency-Key'] = this.actions.get(action).key;
    }
    let response;
    try { response = await fetch(`/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' }); }
    catch { throw new Error(action ? 'Response lost: result is unknown. Retry the same action; its key is retained.' : 'Backend unavailable.'); }
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(`${result.error?.code}: ${result.error?.message} (trace ${result.meta?.traceId ?? 'unavailable'})`);
      error.code = result.error?.code; throw error;
    }
    return result.data;
  }
}

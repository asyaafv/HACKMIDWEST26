/** UI financial inputs and retry behavior are tested independently of server business logic. */
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error Plain browser module is intentionally shipped without a bundler.
import { Api, cents } from '../dev-console/client.js';
describe('console client', () => {
 it('converts decimals without rounding and rejects ambiguous amounts', () => {
  expect(cents('1700.01')).toBe('170001'); expect(cents('0.01')).toBe('1');
  for (const amount of ['1e3','1.001','-1','0','1,700','NaN','01.00','1000000']) expect(() => cents(amount)).toThrow();
 });
 it('retains one key when the response is lost and blocks changed payload retry', async () => {
  const api = new Api(); api.token = 'private-memory-only';
  const requests: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => { requests.push(init); if (requests.length === 1) throw new Error('lost'); return { ok:true,json:async()=>({data:{id:'same-result'}}) }; }));
  try {
   await expect(api.call('/requests',{amountMinor:'170000'},'create')).rejects.toThrow('unknown');
   expect(await api.call('/requests',{amountMinor:'170000'},'create')).toEqual({id:'same-result'});
   expect(requests[0].headers['Idempotency-Key']).toBe(requests[1].headers['Idempotency-Key']);
   await expect(api.call('/requests',{amountMinor:'170001'},'create')).rejects.toThrow('original action');
   api.clear(); expect(api.token).toBe(''); expect(api.actions.size).toBe(0);
  } finally { vi.unstubAllGlobals(); }
 });
});

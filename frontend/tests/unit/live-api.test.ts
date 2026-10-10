/** Exact cents and retained mutation keys protect live purchases after lost responses. */
import { afterEach, expect, it, vi } from 'vitest';
import { LiveApi, minorUnits, usd } from '../../src/live-api';
afterEach(() => vi.unstubAllGlobals());
it('preserves exact cents and rejects formats that require rounding', () => {
  expect(minorUnits('1700.01')).toBe('170001');
  expect(usd('170001')).toBe('$1700.01');
  for (const value of ['0', '1.001', '1e3', '-2', '1,000', '1000000']) expect(() => minorUnits(value)).toThrow();
});
it('retains the identical mutation key after a lost response and rejects changed intent', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValue(new Response(JSON.stringify({ data: { id: 'recorded' } })));
  vi.stubGlobal('fetch', fetcher);
  const api = new LiveApi(); api.token = 'private';
  await expect(api.call('/requests', { amountMinor: '100' }, 'proposal')).rejects.toThrow('Response lost');
  await expect(api.call('/requests', { amountMinor: '101' }, 'proposal')).rejects.toThrow('Uncertain action');
  await expect(api.call('/requests', { amountMinor: '100' }, 'proposal')).resolves.toEqual({ id: 'recorded' });
  expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('uses cookie CSRF only for writes and clears all authentication on disconnect', async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: {} }))));
  vi.stubGlobal('fetch', fetcher);
  const api = new LiveApi(); api.csrf = 'csrf';
  await api.call('/me'); await api.call('/requests/x/consent', {}, 'consent');
  expect(fetcher.mock.calls[0][1].headers['X-CSRF-Token']).toBeUndefined();
  expect(fetcher.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf');
  api.clear(); expect(api.csrf).toBe(''); expect(api.token).toBe('');
});

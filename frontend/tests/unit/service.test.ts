import { describe, expect, it } from 'vitest';
import { LocalDemoService, STORAGE_KEY } from '../../src/service';
import { seed } from '../../src/data';
class MemoryStorage {
  data = new Map<string, string>(); blocked = false;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked) throw new Error('Quota'); this.data.set(key, value); }
}
describe('persistent demo workflows', () => {
  it('seeds the pictured records and consistent 24-record status counts', async () => {
    const service = new LocalDemoService(new MemoryStorage()), state = await service.load();
    expect(state.transactions).toHaveLength(24);
    expect(state.agents).toHaveLength(10);
    expect(new Set(state.agents.map(a => a.avatar)).size).toBe(10);
    expect(['Approved', 'Pending', 'Blocked'].map(d => state.transactions.filter(t => t.decision === d).length)).toEqual([18, 3, 3]);
    expect(state.transactions.slice(0, 10).map(t => t.amount)).toEqual([174200, 82300, 170000, 50000, 241200, 320000, 48000, 89200, 15600, 120000]);
    expect(state.transactions[0].evidence).toHaveLength(5);
    expect(state.transactions[0].checks).toHaveLength(6);
  });
  it('persists new agents, allows shared avatars, and keeps paused history', async () => {
    const storage = new MemoryStorage(), service = new LocalDemoService(storage);
    let state = await service.createGatekeeper({ name: 'Custom-01', description: 'Equipment requests', department: '', avatar: 1 });
    const created = state.agents.at(-1)!;
    expect(created.department).toBe('general');
    state = await service.setGatekeeperActive(created.id, false);
    expect(state.agents.at(-1)!.active).toBe(false);
    expect(state.transactions).toHaveLength(24);
    expect((await new LocalDemoService(storage).load()).agents.at(-1)).toEqual(state.agents.at(-1));
    expect(state.events[0].title).toContain('paused');
  });
  it('uses edited policies only for future requests, then records a one-time review', async () => {
    const service = new LocalDemoService(new MemoryStorage()), before = await service.load();
    await service.updatePolicy('limit', { enabled: true, value: 10000 });
    let state = await service.createRequest({ agentId: 'agent-1', merchantId: 'github', amount: 20000, priority: 'P1', project: 'Engineering expansion', purpose: 'Purchase software licenses' });
    const request = state.transactions[0];
    expect(request.decision).toBe('Pending');
    expect(request.checks.find(c => c.id === 'limit')!.version).toBe(2);
    expect(state.transactions.find(t => t.id === 'REQ-1842')).toEqual(before.transactions[0]);
    state = await service.decideRequest(request.id, 'Approved', 'Necessary for team onboarding');
    expect(state.events[0].type).toBe('decision');
    expect(state.transactions[0].decision).toBe('Approved');
    await expect(service.decideRequest(request.id, 'Blocked', 'Duplicate decision')).rejects.toThrow('Only pending');
  });
  it('blocks prohibited categories and rejects invalid or paused-agent requests', async () => {
    const service = new LocalDemoService(new MemoryStorage());
    const input = { agentId: 'agent-1', merchantId: 'giftcards', amount: 10000, priority: 'P2' as const, project: 'Office', purpose: 'Purchase employee gift cards' };
    expect((await service.createRequest(input)).transactions[0].decision).toBe('Blocked');
    await expect(service.createRequest({ ...input, amount: -1 })).rejects.toThrow('USD amount');
    await service.setGatekeeperActive('agent-1', false);
    await expect(service.createRequest(input)).rejects.toThrow('active Gatekeeper');
  });
  it('does not mutate state or audit history when a save fails', async () => {
    const storage = new MemoryStorage(), service = new LocalDemoService(storage), before = await service.load();
    storage.blocked = true;
    await expect(service.setGatekeeperActive('agent-1', false)).rejects.toThrow('could not save');
    expect(await service.load()).toEqual(before);
  });
  it('preserves corrupt data until an explicit reset', async () => {
    const storage = new MemoryStorage(); storage.data.set(STORAGE_KEY, '{broken');
    const service = new LocalDemoService(storage);
    await expect(service.load()).rejects.toThrow('could not be read');
    expect(storage.getItem(STORAGE_KEY)).toBe('{broken');
    expect((await service.reset()).transactions).toHaveLength(24);
    expect((await service.load()).version).toBe(1);
  });
  it('validates stored records and keeps reset timestamps internally consistent', async () => {
    const storage = new MemoryStorage(); const malformed = seed(); malformed.agents[0].avatar = 100;
    storage.setItem(STORAGE_KEY, JSON.stringify(malformed));
    await expect(new LocalDemoService(storage).load()).rejects.toThrow('unsupported format');
    const now = Date.UTC(2026, 9, 10, 20); expect(Date.parse(seed(now).transactions[0].createdAt)).toBe(now - 10 * 60000);
  });
});

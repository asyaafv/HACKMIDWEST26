import { describe, expect, it } from 'vitest';
import { seed } from '../../src/data';
import { pendingRequests } from '../../src/decisions';

describe('workspace decision ordering', () => {
  it('sorts by priority, oldest creation time, then ID without changing shared records', () => {
    const transactions = seed().transactions.slice(0, 5);
    const [low, newer, tieB, tieA, completed] = transactions;
    for (const t of transactions) t.decision = 'Pending';
    low.priority = 'P2'; low.createdAt = '2020-01-01T00:00:00Z';
    newer.priority = 'P0'; newer.createdAt = '2026-01-02T00:00:00Z';
    tieB.priority = tieA.priority = 'P0';
    tieB.createdAt = tieA.createdAt = '2026-01-01T00:00:00Z';
    tieB.id = 'REQ-B'; tieA.id = 'REQ-A'; completed.decision = 'Approved';
    const before = structuredClone(transactions);
    expect(pendingRequests(transactions).map(t => t.id)).toEqual([tieA.id, tieB.id, newer.id, low.id]);
    expect(transactions).toEqual(before);
  });
});

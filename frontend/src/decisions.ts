import type { Transaction } from './types';

const priorityOrder = { P0: 0, P1: 1, P2: 2 };

/** Workspace-wide review order, independent of transaction search and date filters. */
export function pendingRequests(transactions: Transaction[]): Transaction[] {
  return transactions.filter(t => t.decision === 'Pending').sort((a, b) =>
    priorityOrder[a.priority] - priorityOrder[b.priority]
    || Date.parse(a.createdAt) - Date.parse(b.createdAt)
    || a.id.localeCompare(b.id));
}

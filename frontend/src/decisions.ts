import type { Transaction } from './types';

const priorityOrder = { P0: 0, P1: 1, P2: 2 };

/** Workspace-wide review order, independent of transaction search and date filters. */
export function pendingRequests(transactions: Transaction[]): Transaction[] {
  // Investigation must finish before a proposal enters the human review queue.
  return transactions.filter(t => t.decision === 'Pending' && (!t.investigation || t.investigation.status === 'EVALUATED')).sort((a, b) =>
    priorityOrder[a.priority] - priorityOrder[b.priority]
    || Date.parse(a.createdAt) - Date.parse(b.createdAt)
    || a.id.localeCompare(b.id));
}

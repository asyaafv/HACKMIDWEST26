/** Shared demo reviews bind a stored transaction snapshot; they never mutate payments or budgets. */
import { z } from 'zod';
import type { DB } from './db.js';
import { transaction } from './db.js';
import type { Principal } from './contracts.js';
import { keySchema } from './contracts.js';
import { projectAccess } from './auth.js';
import { hash } from './hash.js';
import { requireThat } from './errors.js';
import { idempotent } from './idempotency.js';
import { appendAudit } from './audit.js';

export interface DemoWorkspace { orgId: string; principalId: string }
const reviewSchema = z.object({ choice: z.enum(['approve','reject']), reason: z.string().trim().min(1).max(1000),
  expectedVersion: z.number().int().positive(), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

/** Only financial/evaluation fields enter the SHA-256 binding; timestamps are not canonicalized as Dates. */
export function transactionSnapshot(row: any, payment: any) {
  return hash({ version: row.version, status: row.status, amountMinor: String(row.amount_minor), proposal: row.proposal, evidence: row.evidence, decision: row.decision,
    payment: payment ? { id: payment.id, amount: String(payment.amount_minor), status: payment.status, hold: payment.hold_state, receipt: payment.receipt } : null });
}
export async function demoPrincipal(db: DB, workspace: DemoWorkspace): Promise<Principal> {
  return transaction(db, workspace.orgId, async tx => {
    const row = (await tx.query("SELECT * FROM principals WHERE org_id=$1 AND id=$2 AND active AND role='FINANCE'", [workspace.orgId,workspace.principalId])).rows[0];
    requireThat(row, 'DEMO_NOT_CONFIGURED', 'The shared demo workspace is unavailable.', 503);
    return { id: row.id, orgId: row.org_id, credentialId: '', role: 'FINANCE', approvalLimitMinor: row.approval_limit_minor,
      capabilities: ['request:read','catalog:read','context:read','finance:consent'] };
  });
}
export async function reviewTransaction(db: DB, principal: Principal, requestId: string, input: unknown, key: string) {
  const body = reviewSchema.parse(input); keySchema.parse(key);
  return transaction(db, principal.orgId, tx => idempotent(tx, principal, 'transaction.review', key, {requestId,...body}, async () => {
    // Lock the request before its payment, so competing reviewers cannot both commit.
    const row = (await tx.query('SELECT * FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE', [principal.orgId,requestId])).rows[0];
    requireThat(row, 'NOT_FOUND', 'Transaction not found.', 404); await projectAccess(tx,principal,row.project_id);
    const investigation=(await tx.query('SELECT status FROM investigations WHERE org_id=$1 AND request_id=$2',[principal.orgId,requestId])).rows[0];
    const payment = (await tx.query('SELECT * FROM payments WHERE org_id=$1 AND request_id=$2 FOR SHARE', [principal.orgId,requestId])).rows[0];
    requireThat(!investigation||payment||investigation.status==='EVALUATED','INVESTIGATION_PENDING','Complete the Gatekeeper investigation before recording a review.',409);
    if(investigation&&!payment&&body.choice==='approve')requireThat(row.evidence.complete&&row.decision.verdict!=='REJECT','POLICY_BLOCKED','Missing evidence or a hard policy denial prevents approval.',422);
    requireThat(row.version === body.expectedVersion && transactionSnapshot(row,payment) === body.snapshotHash,
      'STALE_TRANSACTION', 'This transaction changed. Refresh and review its current details.', 409);
    requireThat(!(await tx.query('SELECT 1 FROM transaction_reviews WHERE org_id=$1 AND request_id=$2 AND request_version=$3', [principal.orgId,requestId,row.version])).rowCount,
      'ALREADY_REVIEWED', 'This transaction already has a recorded review.', 409);
    await tx.query('INSERT INTO transaction_reviews(org_id,request_id,actor_id,choice,reason,snapshot_hash,request_version) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [principal.orgId,requestId,principal.id,body.choice,body.reason,body.snapshotHash,body.expectedVersion]);
    await appendAudit(tx,principal.orgId,principal.id,`transaction.${body.choice === 'approve' ? 'approved' : 'rejected'}`,requestId,
      { ...body, actorMode: 'shared_hackathon_demo', paymentExecution: false });
    return { requestId, choice: body.choice, paymentExecution: false };
  }));
}

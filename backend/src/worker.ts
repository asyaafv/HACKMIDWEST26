/** Durable sandbox executor. A lost provider response retains the hold and reuses the same payment ID. */
import { randomUUID } from "node:crypto";
import type { DB, Tx } from "./db.js";
import { transaction } from "./db.js";
import { appendAudit } from "./audit.js";
import { hash } from "./hash.js";
import { POLICY } from "./policy.js";
import { requireThat } from "./errors.js";

async function finish(tx: Tx, orgId: string, paymentId: string, status: "SUCCEEDED" | "FAILED" | "CANCELLED", receipt: unknown, requestStatus?: string) {
  const ref = (await tx.query("SELECT request_id,budget_id FROM payments WHERE org_id=$1 AND id=$2", [orgId, paymentId])).rows[0];
  await tx.query("SELECT id FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, ref.request_id]);
  await tx.query("SELECT id FROM budgets WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, ref.budget_id]);
  const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, paymentId])).rows[0];
  if (payment.hold_state !== "HELD") return;
  const captured = status === "SUCCEEDED";
  await tx.query("UPDATE budgets SET reserved_minor=reserved_minor-$3,spent_minor=spent_minor+$4 WHERE org_id=$1 AND id=$2", [orgId, payment.budget_id, payment.amount_minor, captured ? payment.amount_minor : "0"]);
  await tx.query("INSERT INTO budget_entries VALUES($1,$2,$3,$4,$5,$6,now())", [randomUUID(), orgId, paymentId, payment.budget_id, captured ? "CAPTURE" : "RELEASE", payment.amount_minor]);
  await tx.query("UPDATE payments SET status=$3,hold_state=$4,receipt=$5 WHERE org_id=$1 AND id=$2", [orgId, paymentId, status, captured ? "CAPTURED" : "RELEASED", receipt]);
  await tx.query("UPDATE requests SET status=$3,version=version+1 WHERE org_id=$1 AND id=$2", [orgId, payment.request_id, requestStatus ?? (captured ? "COMPLETED" : status === "CANCELLED" ? "CANCELLED" : "FAILED")]);
  await tx.query("UPDATE jobs SET done=true,lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND payment_id=$2", [orgId, paymentId]);
  await appendAudit(tx, orgId, null, `payment.${status.toLowerCase()}`, payment.request_id, { paymentId, receipt });
  await appendAudit(tx, orgId, null, captured ? "budget.captured" : "budget.released", payment.request_id, { paymentId, amountMinor: payment.amount_minor });
}

export class GateWorker {
  readonly owner = randomUUID();
  constructor(private db: DB) {}

  async runOnce() {
    const orgs = (await this.db.query("SELECT * FROM gate_pending_orgs()")).rows;
    for (const { org_id: orgId } of orgs) {
      const job = await transaction(this.db, orgId, async tx => (await tx.query(`UPDATE jobs SET lease_owner=$2,lease_until=now()+interval '30 seconds',attempts=attempts+1
        WHERE id=(SELECT id FROM jobs WHERE org_id=$1 AND NOT done AND available_at<=now() AND (lease_until IS NULL OR lease_until<now())
        ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [orgId, this.owner])).rows[0]);
      if (!job) continue;
      try {
        const payment = await this.dispatch(orgId, job.payment_id);
        if (payment) {
          const receipt = await this.simulate(orgId, payment);
          await transaction(this.db, orgId, tx => finish(tx, orgId, payment.id, receipt.status, receipt));
        } else {
          await transaction(this.db, orgId, tx => tx.query("UPDATE jobs SET done=true,lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND id=$2", [orgId, job.id]));
        }
      } catch {
        // Never release on an exception: the provider may already have committed success.
        await transaction(this.db, orgId, async tx => {
          const ref = (await tx.query("SELECT request_id FROM payments WHERE org_id=$1 AND id=$2", [orgId, job.payment_id])).rows[0];
          await tx.query("SELECT id FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, ref.request_id]);
          const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, job.payment_id])).rows[0];
          if (payment.hold_state !== "HELD") return;
          if (payment.dispatched_at) {
            await tx.query("UPDATE payments SET status='UNKNOWN' WHERE org_id=$1 AND id=$2", [orgId, payment.id]);
            await tx.query("UPDATE requests SET status='RECONCILING',version=version+1 WHERE org_id=$1 AND id=$2", [orgId, payment.request_id]);
            await appendAudit(tx, orgId, null, "payment.outcome_unknown", payment.request_id, { paymentId: payment.id });
          }
          await tx.query("UPDATE jobs SET lease_owner=NULL,lease_until=NULL,available_at=now()+interval '5 seconds' WHERE org_id=$1 AND id=$2 AND lease_owner=$3", [orgId, job.id, this.owner]);
        });
      }
      return true;
    }
    return false;
  }

  private async dispatch(orgId: string, paymentId: string) {
    return transaction(this.db, orgId, async tx => {
      const ref = (await tx.query("SELECT request_id FROM payments WHERE org_id=$1 AND id=$2", [orgId, paymentId])).rows[0];
      const request = (await tx.query("SELECT * FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, ref.request_id])).rows[0];
      const agent = (await tx.query("SELECT * FROM agents WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, request.agent_id])).rows[0];
      const merchant = (await tx.query("SELECT * FROM merchants WHERE org_id=$1 AND id=$2 FOR SHARE", [orgId, request.merchant_id])).rows[0];
      const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, paymentId])).rows[0];
      if (payment.hold_state !== "HELD") return null;
      const preview = (await tx.query(`SELECT p.* FROM approvals a JOIN previews p ON p.org_id=a.org_id AND p.id=a.preview_id
        WHERE a.org_id=$1 AND a.id=$2`, [orgId, payment.approval_id])).rows[0];
      requireThat(hash(preview.payload) === payment.bound_hash, "INVALID_BINDING", "Authorization binding mismatch.");
      requireThat(hash(preview.payload.proposal) === hash(request.proposal) && payment.amount_minor === request.amount_minor && payment.amount_minor === preview.payload.proposal.amountMinor,
        "INVALID_BINDING", "Payment parameters differ from the consented purchase.");
      if (!payment.dispatched_at) {
        const credential = (await tx.query(`SELECT c.id FROM credentials c JOIN principals p ON p.org_id=c.org_id AND p.id=c.principal_id
          WHERE c.org_id=$1 AND c.id=$2 AND c.revoked_at IS NULL AND c.expires_at>now() AND p.active`, [orgId, request.credential_id])).rows[0];
        const approver = (await tx.query(`SELECT p.id FROM approvals a JOIN principals p ON p.org_id=a.org_id AND p.id=a.actor_id
          JOIN principal_projects g ON g.org_id=p.org_id AND g.principal_id=p.id AND g.project_id=$3
          WHERE a.org_id=$1 AND a.id=$2 AND p.active AND p.role='FINANCE' AND p.approval_limit_minor >= $4`, [orgId, payment.approval_id, request.project_id, payment.amount_minor])).rows[0];
        const ownerScope = (await tx.query("SELECT 1 FROM principal_projects WHERE org_id=$1 AND principal_id=$2 AND project_id=$3", [orgId, agent.owner_id, request.project_id])).rows[0];
        let sourceChanged = false;
        for (const item of request.evidence.items) {
          const record = (await tx.query("SELECT source_hash,manifest_hash,content FROM source_records WHERE org_id=$1 AND id=$2 AND project_id=$3", [orgId, item.id, request.project_id])).rows[0];
          if (!record || record.source_hash !== item.sourceHash || record.manifest_hash !== item.manifestHash || hash(record.content) !== hash(item.content)) sourceChanged = true;
        }
        const stale = !credential || !approver || !ownerScope || sourceChanged || !agent.active || merchant.status === "DENIED" || preview.payload.agentVersion !== agent.version || preview.payload.merchantVersion !== merchant.version || preview.payload.destinationRef !== merchant.destination_ref || preview.payload.policyHash !== hash(POLICY);
        const expired = new Date(payment.expires_at).getTime() <= Date.now();
        if (stale || expired) {
          await finish(tx, orgId, paymentId, "CANCELLED", { reason: expired ? "AUTHORIZATION_EXPIRED" : "AUTHORIZATION_REVOKED", mode: "sandbox" }, expired ? "EXPIRED" : "CANCELLED");
          return null;
        }
        await tx.query("UPDATE payments SET dispatched_at=now(),status='PROCESSING' WHERE org_id=$1 AND id=$2", [orgId, paymentId]);
        await tx.query("UPDATE requests SET status='EXECUTING',version=version+1 WHERE org_id=$1 AND id=$2", [orgId, request.id]);
        await appendAudit(tx, orgId, null, "authorization.dispatched", request.id, { paymentId, boundHash: payment.bound_hash });
      }
      return { ...payment, destinationRef: preview.payload.destinationRef };
    });
  }

  private async simulate(orgId: string, payment: any) {
    let newlyCreated = false;
    const receipt = await transaction(this.db, orgId, async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`simulator:${orgId}:${payment.id}`]);
      const existing = (await tx.query("SELECT * FROM simulator_transactions WHERE org_id=$1 AND payment_id=$2", [orgId, payment.id])).rows[0];
      const payloadHash = hash({ paymentId: payment.id, amountMinor: payment.amount_minor, currency: "USD", destinationRef: payment.destinationRef, boundHash: payment.bound_hash });
      if (existing) {
        requireThat(existing.payload_hash === payloadHash, "PROVIDER_CONFLICT", "Provider operation already has different parameters.");
        return existing.receipt;
      }
      newlyCreated = true;
      const result = { providerObjectId: randomUUID(), paymentId: payment.id, amountMinor: payment.amount_minor,
        currency: "USD", destinationRef: payment.destinationRef, provider: "simulator", mode: "sandbox",
        label: "SIMULATED — NO MONEY MOVED", status: payment.fault_mode === "DECLINE" ? "FAILED" : "SUCCEEDED", createdAt: new Date().toISOString() };
      await tx.query("INSERT INTO simulator_transactions VALUES($1,$2,$3,$4,$5,$6)", [result.providerObjectId, orgId, payment.id, payloadHash, result.status, result]);
      return result;
    });
    // Fault occurs after the independent provider commit, modeling a lost response.
    if (newlyCreated && payment.fault_mode === "TIMEOUT_AFTER_COMMIT") throw new Error("Simulated response loss");
    return receipt;
  }
}

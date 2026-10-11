/** Durable sandbox executor. A lost provider response retains the hold and reuses the same payment ID. */
import { randomUUID } from "node:crypto";
import type { DB, Tx } from "./db.js";
import { transaction } from "./db.js";
import { appendAudit } from "./audit.js";
import { hash } from "./hash.js";
import { POLICY } from "./policy.js";
import { SimulatorProvider } from "./payments/simulator.js";
import type { PaymentOperation } from "./payments/provider.js";
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
  await tx.query("UPDATE authorizations SET state=$3 WHERE org_id=$1 AND payment_id=$2", [orgId, paymentId, captured ? "CONSUMED" : status === "CANCELLED" && requestStatus === "EXPIRED" ? "EXPIRED" : "REVOKED"]);
  await tx.query("UPDATE requests SET status=$3,version=version+1 WHERE org_id=$1 AND id=$2", [orgId, payment.request_id, requestStatus ?? (captured ? "COMPLETED" : status === "CANCELLED" ? "CANCELLED" : "FAILED")]);
  await tx.query("UPDATE jobs SET done=true,lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND payment_id=$2", [orgId, paymentId]);
  await appendAudit(tx, orgId, null, `payment.${status.toLowerCase()}`, payment.request_id, { paymentId, receipt });
  await appendAudit(tx, orgId, null, captured ? "budget.captured" : "budget.released", payment.request_id, { paymentId, amountMinor: payment.amount_minor });
}

export class GateWorker {
  readonly owner = randomUUID();
  constructor(private db: DB) { this.provider = new SimulatorProvider(db); }

  private readonly provider: SimulatorProvider;
  private readonly maxAttempts = 5;

  async runOnce() {
    await this.db.query(`INSERT INTO worker_heartbeats(owner,last_seen_at) VALUES($1,now())
      ON CONFLICT(owner) DO UPDATE SET last_seen_at=now()`, [this.owner]);
    const orgs = (await this.db.query("SELECT * FROM gate_pending_orgs()")).rows;
    for (const { org_id: orgId } of orgs) {
      const job = await transaction(this.db, orgId, async tx => (await tx.query(`UPDATE jobs SET lease_owner=$2,lease_until=now()+interval '30 seconds',attempts=attempts+1
        WHERE id=(SELECT id FROM jobs WHERE org_id=$1 AND NOT done AND NOT manual_attention AND available_at<=now() AND (lease_until IS NULL OR lease_until<now())
        ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [orgId, this.owner])).rows[0]);
      if (!job) continue;
      let attemptId: string | undefined;
      try {
        const payment = await this.dispatch(orgId, job.payment_id);
        if (!payment) {
          await transaction(this.db, orgId, tx => tx.query("UPDATE jobs SET done=true,lease_owner=NULL,lease_until=NULL WHERE org_id=$1 AND id=$2", [orgId, job.id]));
          return true;
        }
        const operation = this.operation(orgId, payment);
        const prior = await this.provider.retrieve(operation);
        const kind = prior ? "RETRIEVE" : "EXECUTE";
        attemptId = randomUUID();
        await transaction(this.db, orgId, async tx => {
          await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`attempt:${orgId}:${payment.id}`]);
          await tx.query(`INSERT INTO payment_attempts(id,org_id,payment_id,attempt_number,operation,outcome)
            VALUES($1,$2,$3,(SELECT COALESCE(max(attempt_number),0)+1 FROM payment_attempts WHERE org_id=$2 AND payment_id=$3),$4,'STARTED')`,
            [attemptId, orgId, payment.id, kind]);
        });
        const receipt = prior ?? await this.provider.execute(operation);
        await transaction(this.db, orgId, async tx => {
          await finish(tx, orgId, payment.id, receipt.status, receipt);
          await tx.query("UPDATE payment_attempts SET outcome=$3,ended_at=now() WHERE org_id=$1 AND id=$2", [orgId, attemptId, receipt.status]);
        });
      } catch (error) {
        // A provider exception never proves that funds were not committed.
        await transaction(this.db, orgId, async tx => {
          const ref = (await tx.query("SELECT request_id FROM payments WHERE org_id=$1 AND id=$2", [orgId, job.payment_id])).rows[0];
          await tx.query("SELECT id FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, ref.request_id]);
          const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, job.payment_id])).rows[0];
          const code = error instanceof Error && error.message === "SIMULATED_TIMEOUT_BEFORE_COMMIT" ? "SIMULATED_TIMEOUT_BEFORE_COMMIT" :
            error instanceof Error && error.message === "SIMULATED_TIMEOUT_AFTER_COMMIT" ? "SIMULATED_TIMEOUT_AFTER_COMMIT" : "PROVIDER_UNAVAILABLE";
          if (attemptId) await tx.query("UPDATE payment_attempts SET outcome='UNKNOWN',safe_error_code=$3,ended_at=now() WHERE org_id=$1 AND id=$2", [orgId, attemptId, code]);
          if (payment.hold_state !== "HELD") return;
          if (payment.dispatched_at) {
            await tx.query("UPDATE payments SET status='UNKNOWN' WHERE org_id=$1 AND id=$2", [orgId, payment.id]);
            await tx.query("UPDATE requests SET status='RECONCILING',version=version+1 WHERE org_id=$1 AND id=$2 AND status<>'RECONCILING'", [orgId, payment.request_id]);
            await appendAudit(tx, orgId, null, "payment.outcome_unknown", payment.request_id, { paymentId: payment.id, safeErrorCode: code });
          }
          await tx.query(`UPDATE jobs SET lease_owner=NULL,lease_until=NULL,last_error_code=$4,
            manual_attention=$5,available_at=now()+interval '5 seconds' WHERE org_id=$1 AND id=$2 AND lease_owner=$3`,
            [orgId, job.id, this.owner, code, job.attempts >= this.maxAttempts]);
        });
      }
      return true;
    }
    return false;
  }

  private operation(orgId: string, payment: any): PaymentOperation {
    return { orgId, paymentId: payment.id, operationKey: payment.operation_key, requestId: payment.request_id,
      amountMinor: payment.amount_minor, destinationRef: payment.destinationRef, boundHash: payment.bound_hash,
      faultMode: payment.fault_mode };
  }

  async reconcile(orgId: string, paymentId: string) {
    const payment = await transaction(this.db, orgId, async tx => {
      const row = (await tx.query(`SELECT p.*,COALESCE(v.payload,p.policy_snapshot)->>'destinationRef' AS destination_ref FROM payments p
        LEFT JOIN approvals a ON a.org_id=p.org_id AND a.id=p.approval_id
        LEFT JOIN previews v ON v.org_id=a.org_id AND v.id=a.preview_id
        WHERE p.org_id=$1 AND p.id=$2`, [orgId, paymentId])).rows[0];
      requireThat(row, "NOT_FOUND", "Payment not found.", 404);
      return { ...row, destinationRef: row.destination_ref };
    });
    if (payment.hold_state !== "HELD" || !payment.dispatched_at) return { status: payment.status, recovered: false };
    const receipt = await this.provider.retrieve(this.operation(orgId, payment));
    const attemptId = randomUUID();
    await transaction(this.db, orgId, async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`attempt:${orgId}:${paymentId}`]);
      await tx.query(`INSERT INTO payment_attempts(id,org_id,payment_id,attempt_number,operation,outcome,ended_at)
        VALUES($1,$2,$3,(SELECT COALESCE(max(attempt_number),0)+1 FROM payment_attempts WHERE org_id=$2 AND payment_id=$3),'RETRIEVE',$4,now())`,
        [attemptId, orgId, paymentId, receipt?.status ?? "NO_RECORD"]);
      if (receipt) await finish(tx, orgId, paymentId, receipt.status, receipt);
      else await appendAudit(tx, orgId, null, "payment.reconciliation_pending", payment.request_id, { paymentId });
    });
    return { status: receipt?.status ?? "UNKNOWN", recovered: !!receipt, receipt };
  }

  /** Simulator events are deduplicated durably; the receipt is verified by retrieval before accounting. */
  async ingestSimulatorEvent(orgId: string, paymentId: string, eventId: string, status: "PROCESSING" | "SUCCEEDED" | "FAILED") {
    await transaction(this.db, orgId, async tx => {
      await tx.query(`INSERT INTO payment_inbox(id,org_id,payment_id,provider_event_id,event_status)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(org_id,provider_event_id) DO NOTHING`,
        [randomUUID(), orgId, paymentId, eventId, status]);
      const stored = (await tx.query("SELECT payment_id,event_status FROM payment_inbox WHERE org_id=$1 AND provider_event_id=$2", [orgId, eventId])).rows[0];
      requireThat(stored.payment_id === paymentId && stored.event_status === status, "EVENT_CONFLICT", "Provider event identity conflicts with recorded delivery.", 409);
    });
    if (status === "PROCESSING") {
      await transaction(this.db, orgId, tx => tx.query("UPDATE payment_inbox SET processed_at=now() WHERE org_id=$1 AND provider_event_id=$2 AND payment_id=$3", [orgId, eventId, paymentId]));
      return { processed: true, status: "PROCESSING" };
    }
    const result = await this.reconcile(orgId, paymentId);
    // An event is only complete when provider retrieval confirms a definitive result.
    if (result.recovered || result.status === "SUCCEEDED" || result.status === "FAILED") {
      await transaction(this.db, orgId, tx => tx.query("UPDATE payment_inbox SET processed_at=now() WHERE org_id=$1 AND provider_event_id=$2 AND payment_id=$3", [orgId, eventId, paymentId]));
    }
    return result;
  }

  private async dispatch(orgId: string, paymentId: string) {
    return transaction(this.db, orgId, async tx => {
      const ref = (await tx.query("SELECT request_id FROM payments WHERE org_id=$1 AND id=$2", [orgId, paymentId])).rows[0];
      const request = (await tx.query("SELECT * FROM requests WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, ref.request_id])).rows[0];
      const agent = (await tx.query("SELECT * FROM agents WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, request.agent_id])).rows[0];
      const merchant = (await tx.query("SELECT * FROM merchants WHERE org_id=$1 AND id=$2 FOR SHARE", [orgId, request.merchant_id])).rows[0];
      const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND id=$2 FOR UPDATE", [orgId, paymentId])).rows[0];
      if (payment.hold_state !== "HELD") return null;
      const preview = payment.policy_snapshot ? { payload: payment.policy_snapshot } : (await tx.query(`SELECT p.* FROM approvals a JOIN previews p ON p.org_id=a.org_id AND p.id=a.preview_id
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
        const automaticValid = payment.policy_snapshot && request.decision.verdict === "APPROVE" && !request.decision.requiresHumanConsent;
        const stale = !credential || (!approver && !automaticValid) || !ownerScope || sourceChanged || !agent.active || merchant.status === "DENIED" || preview.payload.agentVersion !== agent.version || preview.payload.merchantVersion !== merchant.version || preview.payload.destinationRef !== merchant.destination_ref || preview.payload.policyHash !== hash(POLICY);
        const expired = new Date(payment.expires_at).getTime() <= Date.now();
        if (stale || expired) {
          await finish(tx, orgId, paymentId, "CANCELLED", { reason: expired ? "AUTHORIZATION_EXPIRED" : "AUTHORIZATION_REVOKED", mode: "sandbox" }, expired ? "EXPIRED" : "CANCELLED");
          return null;
        }
        await tx.query("UPDATE payments SET dispatched_at=now(),status='PROCESSING' WHERE org_id=$1 AND id=$2", [orgId, paymentId]);
        await tx.query("UPDATE authorizations SET state='DISPATCHED',dispatched_at=now() WHERE org_id=$1 AND payment_id=$2", [orgId, paymentId]);
        await tx.query("UPDATE requests SET status='EXECUTING',version=version+1 WHERE org_id=$1 AND id=$2", [orgId, request.id]);
        await appendAudit(tx, orgId, null, "authorization.dispatched", request.id, { paymentId, boundHash: payment.bound_hash });
      }
      return { ...payment, destinationRef: preview.payload.destinationRef };
    });
  }

}

/** Gate workflow services bind evidence, policy, exact previews, consent, and locked budget holds. */
import { randomUUID } from "node:crypto";
import type { DB, Tx } from "./db.js";
import { transaction } from "./db.js";
import type { Principal, Proposal, Consent } from "./contracts.js";
import { proposalSchema, consentSchema, keySchema } from "./contracts.js";
import { projectAccess, roleAccess } from "./auth.js";
import { requireThat } from "./errors.js";
import { collectEvidence } from "./evidence.js";
import { evaluate, POLICY } from "./policy.js";
import { hash } from "./hash.js";
import { appendAudit } from "./audit.js";
import { idempotent } from "./idempotency.js";

export async function requestRow(tx: Tx, principal: Principal, id: string, lock = false) {
  const row = (await tx.query(`SELECT * FROM requests WHERE org_id=$1 AND id=$2 ${lock ? "FOR UPDATE" : ""}`, [principal.orgId, id])).rows[0];
  requireThat(row, "NOT_FOUND", "Request not found.", 404);
  await projectAccess(tx, principal, row.project_id);
  if (principal.role === "AGENT") {
    const agent = (await tx.query("SELECT owner_id FROM agents WHERE org_id=$1 AND id=$2", [principal.orgId, row.agent_id])).rows[0];
    requireThat(agent.owner_id === principal.id, "NOT_FOUND", "Request not found.", 404);
  }
  return row;
}

async function context(tx: Tx, principal: Principal, proposal: Proposal, lock = false) {
  await projectAccess(tx, principal, proposal.projectId);
  // All financial paths lock request (if present), agent, merchant, then budget.
  const agent = (await tx.query(`SELECT * FROM agents WHERE org_id=$1 AND id=$2 AND project_id=$3 ${lock ? "FOR UPDATE" : ""}`,
    [principal.orgId, proposal.agentId, proposal.projectId])).rows[0];
  const merchant = (await tx.query(`SELECT * FROM merchants WHERE org_id=$1 AND id=$2 ${lock ? "FOR SHARE" : ""}`, [principal.orgId, proposal.merchantId])).rows[0];
  const budget = (await tx.query(`SELECT * FROM budgets WHERE org_id=$1 AND project_id=$2 AND period_start<=now() AND period_end>now() ORDER BY period_start DESC LIMIT 1 ${lock ? "FOR UPDATE" : ""}`, [principal.orgId, proposal.projectId])).rows[0];
  requireThat(agent && merchant && budget, "CONFIGURATION_UNAVAILABLE", "Assigned agent, merchant, or current budget unavailable.");
  return { agent, merchant, budget };
}

async function decisionFor(tx: Tx, principal: Principal, proposal: Proposal, ctx: Awaited<ReturnType<typeof context>>, complete: boolean) {
  const velocity = (await tx.query(`SELECT COALESCE(sum(p.amount_minor),0)::text AS used,count(*)::integer AS count FROM payments p
    JOIN requests r ON r.org_id=p.org_id AND r.id=p.request_id
    WHERE p.org_id=$1 AND r.agent_id=$2 AND p.created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    AND p.hold_state IN ('HELD','CAPTURED')`, [principal.orgId, proposal.agentId])).rows[0];
  return evaluate({ proposal, agentActive: ctx.agent.active, agentCapMinor: ctx.agent.cap_minor,
    merchantStatus: ctx.merchant.status,
    budgetAvailableMinor: (BigInt(ctx.budget.limit_minor) - BigInt(ctx.budget.spent_minor) - BigInt(ctx.budget.reserved_minor)).toString(),
    dailyUsedMinor: velocity.used, dailyCount: velocity.count, evidenceComplete: complete });
}

function projection(row: any, payment?: any) {
  return { id: row.id, version: row.version, proposal: row.proposal, workflowStatus: row.status,
    decision: row.decision, evidence: row.evidence, createdAt: row.created_at,
    mode: "sandbox", provider: "simulator", payment: payment ? {
      id: payment.id, status: payment.status, holdState: payment.hold_state,
      amountMinor: payment.amount_minor, receipt: payment.receipt, expiresAt: payment.expires_at,
    } : null };
}

export class GateService {
  constructor(public db: DB) {}

  async get(principal: Principal, id: string) {
    return transaction(this.db, principal.orgId, async tx => {
      const row = await requestRow(tx, principal, id);
      const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND request_id=$2", [principal.orgId, id])).rows[0];
      return projection(row, payment);
    });
  }

  async previewProposal(principal: Principal, input: unknown) {
    const proposal = proposalSchema.parse(input);
    return transaction(this.db, principal.orgId, async tx => {
      const ctx = await context(tx, principal, proposal);
      const evidence = await collectEvidence(tx, principal, proposal);
      return { advisory: true, mode: "sandbox", provider: "simulator", evidence,
        proposal, decision: await decisionFor(tx, principal, proposal, ctx, evidence.complete) };
    });
  }

  async create(principal: Principal, input: unknown, key: string) {
    roleAccess(principal, ["OPERATOR", "AGENT"]);
    const proposal = proposalSchema.parse(input);
    keySchema.parse(key);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, "request.create", key, proposal, async () => {
      const ctx = await context(tx, principal, proposal);
      requireThat(ctx.agent.owner_id === principal.id, "FORBIDDEN", "You may submit only for your assigned agent.", 403);
      const evidence = await collectEvidence(tx, principal, proposal);
      const decision = await decisionFor(tx, principal, proposal, ctx, evidence.complete);
      const status = decision.verdict === "REJECT" ? "REJECTED" : evidence.complete ? "AWAITING_CONSENT" : "AWAITING_EVIDENCE";
      const id = randomUUID();
      const row = (await tx.query(`INSERT INTO requests(id,org_id,created_by,credential_id,agent_id,project_id,merchant_id,amount_minor,proposal,evidence,decision,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [id, principal.orgId, principal.id, principal.credentialId, proposal.agentId, proposal.projectId, proposal.merchantId, proposal.amountMinor, proposal, evidence, decision, status])).rows[0];
      await appendAudit(tx, principal.orgId, principal.id, "request.created", id, { proposal, evidenceHash: evidence.bundleHash, decision });
      return projection(row);
    }));
  }

  async preview(principal: Principal, id: string, key: string) {
    roleAccess(principal, ["FINANCE"]);
    keySchema.parse(key);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, "request.preview", key, { id }, async () => {
      const row = await requestRow(tx, principal, id, true);
      requireThat(row.status === "AWAITING_CONSENT", "INVALID_STATE", "This request cannot be authorized.", 409);
      const ctx = await context(tx, principal, row.proposal);
      const current = await decisionFor(tx, principal, row.proposal, ctx, row.evidence.complete);
      const version = row.version + 1;
      const expiresAt = new Date(Date.now() + POLICY.ttlSeconds * 1000).toISOString();
      const payload = { requestId: id, requestVersion: version, proposal: row.proposal, evidenceHash: row.evidence.bundleHash,
        policyHash: hash(POLICY), agentVersion: ctx.agent.version, merchantVersion: ctx.merchant.version,
        destinationRef: ctx.merchant.destination_ref, mode: "sandbox", provider: "simulator", decision: current };
      const previewId = randomUUID();
      const previewHash = hash(payload);
      await tx.query("INSERT INTO previews(id,org_id,request_id,request_version,payload,preview_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [previewId, principal.orgId, id, version, payload, previewHash, expiresAt]);
      await tx.query("UPDATE requests SET version=$3 WHERE org_id=$1 AND id=$2", [principal.orgId, id, version]);
      await appendAudit(tx, principal.orgId, principal.id, "preview.created", id, { previewId, previewHash, version });
      return { id: previewId, previewHash, expectedVersion: version, expiresAt, ...payload };
    }));
  }

  async consent(principal: Principal, id: string, input: unknown, key: string) {
    roleAccess(principal, ["FINANCE"]);
    const consent: Consent = consentSchema.parse(input);
    keySchema.parse(key);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, "request.consent", key, { id, consent }, async () => {
      const row = await requestRow(tx, principal, id, true);
      requireThat(row.status === "AWAITING_CONSENT" && row.version === consent.expectedVersion, "STALE_PREVIEW", "Review a new preview before deciding.", 409);
      const preview = (await tx.query("SELECT * FROM previews WHERE org_id=$1 AND request_id=$2 AND id=$3 AND expires_at>now()", [principal.orgId, id, consent.previewId])).rows[0];
      requireThat(preview && preview.preview_hash === consent.previewHash && preview.request_version === row.version, "STALE_PREVIEW", "Preview is invalid or expired.", 409);
      const approvalId = randomUUID();
      if (consent.choice === "approve") {
        const ctx = await context(tx, principal, row.proposal, true);
        requireThat(row.created_by !== principal.id && ctx.agent.owner_id !== principal.id, "SELF_APPROVAL", "An independent finance approver is required.", 403);
        requireThat(BigInt(row.amount_minor) <= BigInt(principal.approvalLimitMinor), "APPROVAL_LIMIT", "Amount exceeds your approval authority.", 403);
        const currentEvidence = await collectEvidence(tx, principal, row.proposal);
        requireThat(currentEvidence.bundleHash === row.evidence.bundleHash, "STALE_EVIDENCE", "Source evidence changed. Submit a new reviewed request.", 409);
        const live = await decisionFor(tx, principal, row.proposal, ctx, row.evidence.complete);
        requireThat(live.executionAllowed, "POLICY_BLOCKED", "Current policy or required evidence prevents execution.");
        requireThat(preview.payload.policyHash === hash(POLICY) && preview.payload.agentVersion === ctx.agent.version && preview.payload.merchantVersion === ctx.merchant.version && preview.payload.destinationRef === ctx.merchant.destination_ref,
          "STALE_PREVIEW", "Configuration changed. Review a new preview.", 409);
        const required = live.reviewRequirements.filter(r => r.resolution === "HUMAN_JUDGMENT").map(r => r.code);
        requireThat(required.every(code => consent.reviewResolutions.includes(code)), "REVIEW_UNRESOLVED", "Resolve each required review item.");
        await tx.query("INSERT INTO approvals(id,org_id,request_id,preview_id,actor_id,choice,reason,consent_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [approvalId, principal.orgId, id, preview.id, principal.id, consent.choice, consent.reason, hash({ consent, principalId: principal.id })]);
        const paymentId = randomUUID();
        await tx.query(`INSERT INTO payments(id,org_id,request_id,approval_id,budget_id,amount_minor,bound_hash,status,hold_state,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,'QUEUED','HELD',now()+interval '5 minutes')`, [paymentId, principal.orgId, id, approvalId, ctx.budget.id, row.amount_minor, hash(preview.payload)]);
        await tx.query("UPDATE budgets SET reserved_minor=reserved_minor+$3 WHERE org_id=$1 AND id=$2", [principal.orgId, ctx.budget.id, row.amount_minor]);
        await tx.query("INSERT INTO budget_entries VALUES($1,$2,$3,$4,'RESERVE',$5,now())", [randomUUID(), principal.orgId, paymentId, ctx.budget.id, row.amount_minor]);
        await tx.query("INSERT INTO jobs(id,org_id,payment_id) VALUES($1,$2,$3)", [randomUUID(), principal.orgId, paymentId]);
        await tx.query("UPDATE requests SET status='AUTHORIZED',version=version+1 WHERE org_id=$1 AND id=$2", [principal.orgId, id]);
        await appendAudit(tx, principal.orgId, principal.id, "consent.granted", id, { approvalId, previewHash: preview.preview_hash, paymentId, liveDecision: live });
        await appendAudit(tx, principal.orgId, principal.id, "budget.reserved", id, { paymentId, amountMinor: row.amount_minor });
        return { requestId: id, paymentId, workflowStatus: "AUTHORIZED", mode: "sandbox" };
      }
      await tx.query("INSERT INTO approvals(id,org_id,request_id,preview_id,actor_id,choice,reason,consent_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [approvalId, principal.orgId, id, preview.id, principal.id, consent.choice, consent.reason, hash({ consent, principalId: principal.id })]);
      await tx.query("UPDATE requests SET status='REJECTED',version=version+1 WHERE org_id=$1 AND id=$2", [principal.orgId, id]);
      await appendAudit(tx, principal.orgId, principal.id, "consent.declined", id, { approvalId, reason: consent.reason });
      return { requestId: id, workflowStatus: "REJECTED", mode: "sandbox" };
    }));
  }

  async cancel(principal: Principal, id: string, key: string) {
    roleAccess(principal, ["OPERATOR", "AGENT", "FINANCE"]);
    keySchema.parse(key);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, "request.cancel", key, { id }, async () => {
      const row = await requestRow(tx, principal, id, true);
      requireThat(principal.role === "FINANCE" || row.created_by === principal.id, "FORBIDDEN", "Only the request owner or finance can cancel.", 403);
      requireThat(["AWAITING_EVIDENCE", "AWAITING_CONSENT", "AUTHORIZED"].includes(row.status), "INVALID_STATE", "This request cannot be cancelled.", 409);
      const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND request_id=$2 FOR UPDATE", [principal.orgId, id])).rows[0];
      if (payment) {
        requireThat(!payment.dispatched_at, "ALREADY_DISPATCHED", "Dispatched payments require reconciliation.", 409);
        await tx.query("SELECT id FROM budgets WHERE org_id=$1 AND id=$2 FOR UPDATE", [principal.orgId, payment.budget_id]);
        await tx.query("UPDATE budgets SET reserved_minor=reserved_minor-$3 WHERE org_id=$1 AND id=$2", [principal.orgId, payment.budget_id, payment.amount_minor]);
        await tx.query("UPDATE payments SET status='CANCELLED',hold_state='RELEASED' WHERE org_id=$1 AND id=$2", [principal.orgId, payment.id]);
        await tx.query("INSERT INTO budget_entries VALUES($1,$2,$3,$4,'RELEASE',$5,now())", [randomUUID(), principal.orgId, payment.id, payment.budget_id, payment.amount_minor]);
        await appendAudit(tx, principal.orgId, principal.id, "budget.released", id, { paymentId: payment.id });
      }
      await tx.query("UPDATE requests SET status='CANCELLED',version=version+1 WHERE org_id=$1 AND id=$2", [principal.orgId, id]);
      await appendAudit(tx, principal.orgId, principal.id, "request.cancelled", id, {});
      return { requestId: id, workflowStatus: "CANCELLED" };
    }));
  }

  async list(principal: Principal) {
    return transaction(this.db, principal.orgId, async tx => (await tx.query(`SELECT r.* FROM requests r
      JOIN principal_projects g ON g.org_id=r.org_id AND g.project_id=r.project_id AND g.principal_id=$2
      JOIN agents a ON a.org_id=r.org_id AND a.id=r.agent_id
      WHERE r.org_id=$1 AND ($3<>'AGENT' OR a.owner_id=$2) ORDER BY r.created_at DESC,r.id LIMIT 50`, [principal.orgId, principal.id, principal.role])).rows.map(r => projection(r)));
  }

  async catalog(principal: Principal) {
    return transaction(this.db, principal.orgId, async tx => {
      const projects = (await tx.query("SELECT p.* FROM projects p JOIN principal_projects g ON g.org_id=p.org_id AND g.project_id=p.id WHERE g.org_id=$1 AND g.principal_id=$2", [principal.orgId, principal.id])).rows;
      const agents = (await tx.query(`SELECT a.* FROM agents a JOIN principal_projects g ON g.org_id=a.org_id AND g.project_id=a.project_id WHERE g.org_id=$1 AND g.principal_id=$2 AND ($3 NOT IN ('OPERATOR','AGENT') OR a.owner_id=$2)`, [principal.orgId, principal.id, principal.role])).rows;
      const budgets = (await tx.query("SELECT b.* FROM budgets b JOIN principal_projects g ON g.org_id=b.org_id AND g.project_id=b.project_id WHERE g.org_id=$1 AND g.principal_id=$2", [principal.orgId, principal.id])).rows;
      const merchants = (await tx.query("SELECT id,name,status FROM merchants WHERE org_id=$1", [principal.orgId])).rows;
      return { projects, agents, budgets, merchants, policy: POLICY, mode: "sandbox", provider: "simulator" };
    });
  }

  async search(principal: Principal, query: string) {
    requireThat(query.length >= 2 && query.length <= 200, "INVALID_QUERY", "Search requires 2–200 characters.", 400);
    return transaction(this.db, principal.orgId, async tx => (await tx.query(`SELECT s.id,s.domain,s.source_id,s.dataset_label,s.source_hash FROM source_records s
      JOIN principal_projects g ON g.org_id=s.org_id AND g.project_id=s.project_id AND g.principal_id=$2
      WHERE s.org_id=$1 AND (strpos(lower(s.source_id),lower($3))>0 OR strpos(lower(s.content::text),lower($3))>0)
      ORDER BY s.id LIMIT 50`, [principal.orgId, principal.id, query])).rows);
  }

  async events(principal: Principal, id: string) {
    return transaction(this.db, principal.orgId, async tx => {
      await requestRow(tx, principal, id);
      return (await tx.query("SELECT * FROM audit_events WHERE org_id=$1 AND packet->>'resourceId'=$2 ORDER BY sequence LIMIT 100", [principal.orgId, id])).rows;
    });
  }

  async explain(principal: Principal, id: string) {
    const request = await this.get(principal, id);
    return { requestId: id, mode: "sandbox", provider: "simulator", purchase: request.proposal,
      policy: request.decision, citations: request.evidence.items, missing: request.evidence.missing,
      payment: request.payment, audit: await this.events(principal, id),
      limitations: ["Proposed purchase effectiveness is not established by incident context.", "Simulator only: no money moved."] };
  }
}

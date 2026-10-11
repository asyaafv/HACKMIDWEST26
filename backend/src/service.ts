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
import { transactionSnapshot } from "./transaction-review.js";
import { queueTrust, trustForRequest } from "./trust-store.js";
import { GateWorker } from "./worker.js";

export async function requestRow(tx: Tx, principal: Principal, id: string, lock = false) {
  const row = (await tx.query(`SELECT * FROM requests WHERE org_id=$1 AND id=$2 ${lock ? "FOR UPDATE" : ""}`, [principal.orgId, id])).rows[0];
  requireThat(row, "NOT_FOUND", "Request not found.", 404);
  await projectAccess(tx, principal, row.project_id);
  if (principal.role === "AGENT" && !principal.capabilities?.includes("investigation:write")) {
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

async function decisionFor(tx: Tx, principal: Principal, proposal: Proposal, ctx: Awaited<ReturnType<typeof context>>, complete: boolean, contradictoryEvidence = false, excludeRequestId?:string, trustPending = false) {
  const velocity = (await tx.query(`SELECT COALESCE(sum(p.amount_minor),0)::text AS used,count(*)::integer AS count FROM payments p
    JOIN requests r ON r.org_id=p.org_id AND r.id=p.request_id
    WHERE p.org_id=$1 AND r.agent_id=$2 AND p.created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    AND p.hold_state IN ('HELD','CAPTURED')`, [principal.orgId, proposal.agentId])).rows[0];
  // A recorded proposal is enough to flag a second matching intent; payment is not required.
  const duplicate = (await tx.query(`SELECT 1 FROM requests r
    WHERE r.org_id=$1 AND r.agent_id=$2 AND r.project_id=$3 AND r.merchant_id=$4 AND r.amount_minor=$5
      AND r.proposal->'source'=$6::jsonb AND r.proposal->>'category'=$7
      AND lower(trim(r.proposal->>'purpose'))=lower(trim($8::text))
      AND r.id<>COALESCE($9::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
      AND r.created_at>=now()-interval '10 minutes' LIMIT 1`,
    [principal.orgId, proposal.agentId, proposal.projectId, proposal.merchantId, proposal.amountMinor,
      proposal.source, proposal.category, proposal.purpose, excludeRequestId??null])).rows.length > 0;
  const trust = excludeRequestId ? await trustForRequest(tx, principal.orgId, excludeRequestId) : trustPending ? {status:"PENDING" as const,adjustment:0,unresolved:false} : undefined;
  return evaluate({ trust, duplicateIntent: duplicate, contradictoryEvidence, proposal, agentActive: ctx.agent.active, agentCapMinor: ctx.agent.cap_minor,
    merchantStatus: ctx.merchant.status,
    budgetAvailableMinor: (BigInt(ctx.budget.limit_minor) - BigInt(ctx.budget.spent_minor) - BigInt(ctx.budget.reserved_minor)).toString(),
    dailyUsedMinor: velocity.used, dailyCount: velocity.count, evidenceComplete: complete });
}

function projection(row: any, payment?: any, approval?: any) {
  return { id: row.id, version: row.version, origin: row.origin ?? "REQUEST", proposal: row.proposal, workflowStatus: row.status,
    policyVerdict: row.decision?.verdict ?? null, consentStatus: approval ? approval.choice === "approve" ? "GRANTED" : "DECLINED" : "NONE",
    authorizationStatus: !payment && approval?.choice === "approve" ? "REVIEWED" : payment ? payment.hold_state === "CAPTURED" ? "CONSUMED" : payment.hold_state === "RELEASED" ? "REVOKED" : payment.dispatched_at ? "DISPATCHED" : "READY" : "NONE",
    decision: row.decision, evidence: row.evidence, createdAt: row.created_at,
    mode: "sandbox", provider: "simulator", payment: payment ? {
      id: payment.id, status: payment.status, holdState: payment.hold_state, operationKey: payment.operation_key,
      amountMinor: payment.amount_minor, receipt: payment.receipt, expiresAt: payment.expires_at,
    } : null };
}

export class GateService {
  constructor(public db: DB, public options: {trustEnabled?:boolean;trustTimeoutSeconds?:number} = {}) {}

  async applyTrustResult(tx: Tx, orgId: string, row: any) {
    // Callback authority cannot impersonate an arbitrary user: recover the stored purchaser.
    const owner = (await tx.query("SELECT * FROM principals WHERE org_id=$1 AND id=$2 AND active",[orgId,row.created_by])).rows[0];
    const scope = (await tx.query("SELECT 1 FROM principal_projects WHERE org_id=$1 AND principal_id=$2 AND project_id=$3",[orgId,row.created_by,row.project_id])).rowCount;
    if (!owner || !scope) {
      await tx.query("UPDATE requests SET status='CANCELLED',version=version+1 WHERE org_id=$1 AND id=$2",[orgId,row.id]);
      await appendAudit(tx,orgId,null,"trust.purchaser_unavailable",row.id,{});
      return;
    }
    const principal: Principal = {id:owner.id,orgId,credentialId:row.credential_id,role:owner.role,approvalLimitMinor:owner.approval_limit_minor};
    const ctx = await context(tx,principal,row.proposal,true);
    const decision = await decisionFor(tx,principal,row.proposal,ctx,row.evidence.complete,
      Boolean(row.evidence.unresolvedRequirements?.some((r:string)=>r.startsWith("CONTRADICTORY_FACT"))),row.id);
    const version = row.version + 1;
    const status = decision.verdict === "REJECT" ? "REJECTED" : decision.reviewRequirements.some(r=>r.resolution==="NEW_EVIDENCE") ? "AWAITING_EVIDENCE" : "AWAITING_CONSENT";
    await tx.query("UPDATE requests SET decision=$3,status=$4,version=$5 WHERE org_id=$1 AND id=$2",[orgId,row.id,decision,status,version]);
    await tx.query("INSERT INTO request_revisions(id,org_id,request_id,revision,proposal,proposal_hash,evidence,evidence_hash,decision,decision_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [randomUUID(),orgId,row.id,version,row.proposal,hash(row.proposal),row.evidence,hash(row.evidence),decision,hash(decision)]);
    await appendAudit(tx,orgId,null,"trust.evaluated",row.id,{version,decision});
    await this.authorizeLowRisk(tx,principal,{...row,decision,version,status});
  }

  /** Agent lock serializes distinct submissions before duplicate checks and reservations. */
  async authorizeLowRisk(tx: Tx, principal: Principal, row: any) {
    const ctx = await context(tx, principal, row.proposal, true);
    const decision = await decisionFor(tx, principal, row.proposal, ctx, row.evidence.complete,
      Boolean(row.evidence.unresolvedRequirements?.some((r: string) => r.startsWith("CONTRADICTORY_FACT"))), row.id);
    if (decision.verdict !== "APPROVE" || decision.requiresHumanConsent || !decision.executionAllowed) return false;
    if ((await tx.query("SELECT 1 FROM payments WHERE org_id=$1 AND request_id=$2", [principal.orgId, row.id])).rowCount) return true;
    const payload = { proposal: row.proposal, evidenceHash: row.evidence.bundleHash, policyHash: hash(POLICY),
      agentVersion: ctx.agent.version, merchantVersion: ctx.merchant.version, destinationRef: ctx.merchant.destination_ref };
    const paymentId = randomUUID();
    await tx.query(`INSERT INTO payments(id,org_id,request_id,budget_id,amount_minor,bound_hash,status,hold_state,expires_at,operation_key,policy_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,'QUEUED','HELD',now()+interval '5 minutes',$1::uuid::text,$7)`,
      [paymentId, principal.orgId, row.id, ctx.budget.id, row.amount_minor, hash(payload), payload]);
    await tx.query(`INSERT INTO authorizations(id,org_id,request_id,payment_id,budget_id,bound_hash,state,expires_at)
      SELECT $1,$2,$3,$4,$5,$6,'READY',expires_at FROM payments WHERE org_id=$2 AND id=$4`,
      [randomUUID(), principal.orgId, row.id, paymentId, ctx.budget.id, hash(payload)]);
    await tx.query("UPDATE budgets SET reserved_minor=reserved_minor+$3 WHERE org_id=$1 AND id=$2", [principal.orgId, ctx.budget.id, row.amount_minor]);
    await tx.query("INSERT INTO budget_entries VALUES($1,$2,$3,$4,'RESERVE',$5,now())", [randomUUID(), principal.orgId, paymentId, ctx.budget.id, row.amount_minor]);
    await tx.query("INSERT INTO jobs(id,org_id,payment_id) VALUES($1,$2,$3)", [randomUUID(), principal.orgId, paymentId]);
    await tx.query("UPDATE requests SET status='AUTHORIZED' WHERE org_id=$1 AND id=$2", [principal.orgId, row.id]);
    await appendAudit(tx, principal.orgId, null, "policy.authorized", row.id, { paymentId, decision, authority: "DETERMINISTIC_POLICY" });
    return true;
  }

  async get(principal: Principal, id: string) {
    return transaction(this.db, principal.orgId, async tx => {
      const row = await requestRow(tx, principal, id);
      const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND request_id=$2", [principal.orgId, id])).rows[0];
      const approval = (await tx.query("SELECT choice FROM approvals WHERE org_id=$1 AND request_id=$2", [principal.orgId, id])).rows[0];
      const capabilities = (principal as Principal & { capabilities?: string[] }).capabilities;
      const can = (capability: string) => !capabilities || capabilities.includes(capability);
      const permittedActions = [
        ...(principal.role === "FINANCE" && can("finance:consent") && row.status === "AWAITING_CONSENT" ? ["PREVIEW_CONSENT"] : []),
        ...(["OPERATOR","AGENT","FINANCE"].includes(principal.role) &&
          can("request:cancel") && (principal.role === "FINANCE" || row.created_by === principal.id) &&
          ["AWAITING_EVIDENCE","AWAITING_CONSENT","AUTHORIZED"].includes(row.status) && !payment?.dispatched_at ? ["CANCEL"] : []),
        ...(["FINANCE","ADMIN"].includes(principal.role) && can("finance:reconcile") && payment?.dispatched_at && payment.hold_state === "HELD" ? ["RECONCILE"] : []),
      ];
      const transactionReview = (await tx.query('SELECT * FROM transaction_reviews WHERE org_id=$1 AND request_id=$2 ORDER BY request_version DESC LIMIT 1',[principal.orgId,id])).rows[0] ?? null;
      const investigation=(await tx.query('SELECT * FROM investigations WHERE org_id=$1 AND request_id=$2',[principal.orgId,id])).rows[0] ?? null;
      const trustAssessment = (await tx.query("SELECT id,status,adjustment,response,failure_code,created_at,completed_at FROM trust_assessments WHERE org_id=$1 AND request_id=$2",[principal.orgId,id])).rows[0] ?? null;
      return { ...projection(row, payment, approval), transactionReview, investigation, trustAssessment, permittedActions };
    });
  }

  /** Reevaluation is advisory: it cannot reserve budget or create a payment. */
  async evaluateInvestigation(tx:Tx,principal:Principal,row:any,evidence:any) {
    const ctx=await context(tx,principal,row.proposal,true);
    return decisionFor(tx,principal,row.proposal,ctx,evidence.complete,Boolean(evidence.unresolvedRequirements?.some((r:string)=>r.startsWith('CONTRADICTORY_FACT'))),row.id);
  }
  async evaluationHistory(principal:Principal,id:string) {
    return transaction(this.db,principal.orgId,async tx=>{
      await requestRow(tx,principal,id);
      const rows=(await tx.query('SELECT revision,decision,evidence,created_at FROM request_revisions WHERE org_id=$1 AND request_id=$2 ORDER BY revision DESC LIMIT 10',[principal.orgId,id])).rows;
      const reviews=(await tx.query('SELECT request_version,choice,reason,created_at FROM transaction_reviews WHERE org_id=$1 AND request_id=$2 ORDER BY request_version DESC LIMIT 10',[principal.orgId,id])).rows;
      return {items:rows.map(r=>({version:r.revision,createdAt:r.created_at,verdict:r.decision.verdict,riskScore:r.decision.riskScore,
        evidenceHash:r.evidence.bundleHash,mode:r.evidence.investigation?.mode??'INITIAL_CHECK',
        unresolvedQuestions:r.evidence.investigation?.report?.unresolvedQuestions??[],
        citations:r.evidence.items.map((item:any)=>({sourceId:item.sourceId,sourceHash:item.sourceHash,contentHash:item.contentHash})),
        review:reviews.find(review=>review.request_version===r.revision)??null})),limit:10,exhaustive:false};
    });
  }
  async previewProposal(principal: Principal, input: unknown) {
    const proposal = proposalSchema.parse(input);
    return transaction(this.db, principal.orgId, async tx => {
      const ctx = await context(tx, principal, proposal);
      const evidence = await collectEvidence(tx, principal, proposal);
      return { advisory: true, mode: "sandbox", provider: "simulator", evidence,
        proposal, decision: await decisionFor(tx, principal, proposal, ctx, evidence.complete, Boolean(evidence.unresolvedRequirements?.some((r: string) => r.startsWith("CONTRADICTORY_FACT")))) };
    });
  }

  /** Read-only validation reruns the authoritative policy without replacing the archived decision. */
  async validateDecision(principal: Principal, id: string) {
    return transaction(this.db, principal.orgId, async tx => {
      const row = await requestRow(tx, principal, id);
      const fresh = await collectEvidence(tx, principal, row.proposal);
      const questions: string[] = row.evidence.investigation?.report?.unresolvedQuestions ?? [];
      const evidence = { ...fresh, complete: fresh.complete && questions.length === 0 };
      const ctx = await context(tx, principal, row.proposal);
      const decision = await decisionFor(tx, principal, row.proposal, ctx, evidence.complete,
        fresh.unresolvedRequirements.some((r: string) => r.startsWith("CONTRADICTORY_FACT")), row.id);
      const evidenceContent = (value: any) => ({ items: value.items, links: value.links, missing: value.missing,
        unresolvedRequirements: value.unresolvedRequirements?.filter((r: string) => !r.startsWith("GATEKEEPER_QUESTION_")),
        coverage: value.coverage, referenceTime: value.referenceTime });
      const evidenceMatches = hash(evidenceContent(row.evidence)) === hash(evidenceContent(fresh));
      const findings = (value: any) => ({ verdict: value.verdict, riskScore: value.riskScore, factors: value.factors,
        rules: value.rules, reviewRequirements: value.reviewRequirements, executionAllowed: value.executionAllowed });
      const decisionMatches = hash(findings(row.decision)) === hash(findings(decision));
      const policyMatches = row.decision.policyHash === decision.policyHash;
      const reasons = [
        ...(!evidenceMatches ? ["EVIDENCE_CHANGED"] : []),
        ...(!policyMatches ? ["POLICY_CHANGED"] : []),
        ...(!decisionMatches ? ["POLICY_FINDINGS_CHANGED"] : []),
      ];
      return { requestId: id, requestVersion: row.version, checkedAt: new Date().toISOString(),
        status: reasons.length ? "CHANGED" as const : "VALID" as const, reasons,
        evidenceMatches, decisionMatches, policyMatches, storedDecision: row.decision, decision,
        evidence: { complete: evidence.complete, sourceCount: fresh.items.length,
          unresolvedRequirements: [...fresh.unresolvedRequirements, ...questions] },
        policy: POLICY, advisory: true, paymentExecution: false };
    });
  }

  async create(principal: Principal, input: unknown, key: string, origin: "REQUEST" | "SIMULATED_PURCHASE" = "REQUEST") {
    roleAccess(principal, ["OPERATOR", "AGENT"]);
    const proposal = proposalSchema.parse(input);
    keySchema.parse(key);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, "request.create", key, origin === "REQUEST" ? proposal : {proposal,origin}, async () => {
      const ctx = await context(tx, principal, proposal, true);
      requireThat(ctx.agent.owner_id === principal.id, "FORBIDDEN", "You may submit only for your assigned agent.", 403);
      const evidence = await collectEvidence(tx, principal, proposal);
      const initial = await decisionFor(tx, principal, proposal, ctx, evidence.complete, Boolean(evidence.unresolvedRequirements?.some((r: string) => r.startsWith("CONTRADICTORY_FACT"))));
      const trustRequired = !!this.options.trustEnabled && initial.verdict !== "REJECT";
      const decision = trustRequired ? await decisionFor(tx, principal, proposal, ctx, evidence.complete, Boolean(evidence.unresolvedRequirements?.some((r: string) => r.startsWith("CONTRADICTORY_FACT"))), undefined, true) : initial;
      const status = decision.verdict === "REJECT" ? "REJECTED" : evidence.complete ? "AWAITING_CONSENT" : "AWAITING_EVIDENCE";
      const id = randomUUID();
      const row = (await tx.query(`INSERT INTO requests(id,org_id,created_by,credential_id,agent_id,project_id,merchant_id,amount_minor,proposal,evidence,decision,status,origin,trust_required)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [id, principal.orgId, principal.id, principal.credentialId, proposal.agentId, proposal.projectId, proposal.merchantId, proposal.amountMinor, proposal, evidence, decision, trustRequired ? "AWAITING_EVIDENCE" : status, origin, trustRequired])).rows[0];
      if (trustRequired) await queueTrust(tx, principal, row, this.options.trustTimeoutSeconds ?? 60);
      await tx.query(`INSERT INTO request_revisions(id,org_id,request_id,revision,proposal,proposal_hash,evidence,evidence_hash,decision,decision_hash)
        VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9)`, [randomUUID(), principal.orgId, id, proposal, hash(proposal), evidence, hash(evidence), decision, hash(decision)]);
      await tx.query("INSERT INTO investigations(org_id,request_id,status) VALUES($1,$2,'WAITING')",[principal.orgId,id]);
      await appendAudit(tx, principal.orgId, principal.id, "request.created", id, { proposal, origin, evidenceHash: evidence.bundleHash, decision });
      if (await this.authorizeLowRisk(tx, principal, row)) row.status = "AUTHORIZED";
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
      const current = await decisionFor(tx, principal, row.proposal, ctx, row.evidence.complete, Boolean(row.evidence.unresolvedRequirements?.some((r: string) => r.startsWith("CONTRADICTORY_FACT"))), row.id);
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

  async consent(principal: Principal, id: string, input: unknown, key: string, executePayment = true) {
    roleAccess(principal, ["FINANCE"]);
    const consent: Consent = consentSchema.parse(input);
    keySchema.parse(key);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, executePayment ? "request.consent" : "request.review", key, { id, consent }, async () => {
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
        const live = await decisionFor(tx, principal, row.proposal, ctx, row.evidence.complete, Boolean(row.evidence.unresolvedRequirements?.some((r: string) => r.startsWith("CONTRADICTORY_FACT"))), row.id);
        requireThat(live.executionAllowed, "POLICY_BLOCKED", "Current policy or required evidence prevents execution.");
        requireThat(preview.payload.policyHash === hash(POLICY) && preview.payload.agentVersion === ctx.agent.version && preview.payload.merchantVersion === ctx.merchant.version && preview.payload.destinationRef === ctx.merchant.destination_ref,
          "STALE_PREVIEW", "Configuration changed. Review a new preview.", 409);
        const required = live.reviewRequirements.filter(r => r.resolution === "HUMAN_JUDGMENT").map(r => r.code);
        requireThat(required.every(code => consent.reviewResolutions.includes(code)), "REVIEW_UNRESOLVED", "Resolve each required review item.");
        await tx.query("INSERT INTO approvals(id,org_id,request_id,preview_id,actor_id,choice,reason,consent_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [approvalId, principal.orgId, id, preview.id, principal.id, consent.choice, consent.reason, hash({ consent, principalId: principal.id })]);
        // Enterprise review records authority and evidence only; no payment or budget mutation.
        if (!executePayment) {
          await tx.query("UPDATE requests SET status='AUTHORIZED',version=version+1 WHERE org_id=$1 AND id=$2", [principal.orgId, id]);
          await appendAudit(tx, principal.orgId, principal.id, "review.approved", id, { approvalId, previewHash: preview.preview_hash, reason: consent.reason, liveDecision: live, paymentExecution: false });
          return { requestId: id, workflowStatus: "AUTHORIZED", paymentExecution: false };
        }
        const paymentId = randomUUID();
        await tx.query(`INSERT INTO payments(id,org_id,request_id,approval_id,budget_id,amount_minor,bound_hash,status,hold_state,expires_at,operation_key)
          VALUES($1,$2,$3,$4,$5,$6,$7,'QUEUED','HELD',now()+interval '5 minutes',$1::uuid::text)`, [paymentId, principal.orgId, id, approvalId, ctx.budget.id, row.amount_minor, hash(preview.payload)]);
        await tx.query(`INSERT INTO authorizations(id,org_id,request_id,approval_id,payment_id,budget_id,bound_hash,state,expires_at)
          SELECT $1,$2,$3,$4,$5,$6,$7,'READY',expires_at FROM payments WHERE org_id=$2 AND id=$5`,
          [randomUUID(), principal.orgId, id, approvalId, paymentId, ctx.budget.id, hash(preview.payload)]);
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
      return { requestId: id, workflowStatus: "REJECTED", mode: "sandbox", ...(!executePayment ? {paymentExecution: false} : {}) };
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
        await tx.query("UPDATE authorizations SET state='REVOKED' WHERE org_id=$1 AND payment_id=$2", [principal.orgId, payment.id]);
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


  /** Scoped inspection does not expose provider destinations outside finance/admin roles. */
  async paymentDetail(principal: Principal, paymentId: string) {
    return transaction(this.db, principal.orgId, async tx => {
      const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND id=$2", [principal.orgId, paymentId])).rows[0];
      requireThat(payment, "NOT_FOUND", "Payment not found.", 404);
      const request = await requestRow(tx, principal, payment.request_id);
      const authorization = (await tx.query("SELECT * FROM authorizations WHERE org_id=$1 AND payment_id=$2", [principal.orgId, paymentId])).rows[0];
      const attempts = (await tx.query(`SELECT id,attempt_number,operation,outcome,safe_error_code,started_at,ended_at
        FROM payment_attempts WHERE org_id=$1 AND payment_id=$2 ORDER BY attempt_number`, [principal.orgId, paymentId])).rows;
      const events = (await tx.query(`SELECT provider_event_id,event_status,received_at,processed_at
        FROM payment_inbox WHERE org_id=$1 AND payment_id=$2 ORDER BY received_at`, [principal.orgId, paymentId])).rows;
      const job = (await tx.query(`SELECT attempts,lease_until,available_at,last_error_code,manual_attention,done
        FROM jobs WHERE org_id=$1 AND payment_id=$2`, [principal.orgId, paymentId])).rows[0];
      return { requestId: request.id, paymentId, workflowStatus: request.status, policyVerdict: request.decision.verdict,
        consentStatus: "GRANTED", authorizationStatus: authorization?.state ?? "UNKNOWN", paymentStatus: payment.status,
        holdState: payment.hold_state, amountMinor: payment.amount_minor, operationKey: payment.operation_key,
        receipt: payment.receipt, expiresAt: payment.expires_at, dispatchedAt: payment.dispatched_at,
        faultMode: principal.role === "ADMIN" || principal.role === "FINANCE" ? payment.fault_mode : undefined,
        attempts, events, job };
    });
  }

  async reconcilePayment(principal: Principal, paymentId: string, key: string) {
    roleAccess(principal, ["FINANCE", "ADMIN"]);
    const scoped = principal as Principal & { capabilities?: string[] };
    requireThat(!scoped.capabilities || scoped.capabilities.includes("finance:reconcile"), "FORBIDDEN", "Credential lacks reconciliation capability.", 403);
    keySchema.parse(key);
    await this.paymentDetail(principal, paymentId);
    const operation = "payment.reconcile";
    const existing = await transaction(this.db, principal.orgId, async tx =>
      (await tx.query("SELECT request_hash,response FROM idempotency_records WHERE org_id=$1 AND principal_id=$2 AND operation=$3 AND key=$4",
        [principal.orgId, principal.id, operation, key])).rows[0]);
    if (existing) {
      requireThat(existing.request_hash === hash({ paymentId }), "IDEMPOTENCY_CONFLICT", "This key belongs to another payment.", 409);
      return existing.response;
    }
    // Retrieval is outside the request transaction and never creates a new provider key.
    const result = await new GateWorker(this.db).reconcile(principal.orgId, paymentId);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, operation, key, { paymentId }, async () => result));
  }

  async setPaymentFault(principal: Principal, paymentId: string, mode: string, key: string, development: boolean) {
    roleAccess(principal, ["ADMIN"]);
    const scoped = principal as Principal & { capabilities?: string[] };
    requireThat(!scoped.capabilities || scoped.capabilities.includes("admin:fault"), "FORBIDDEN", "Credential lacks fault-control capability.", 403);
    keySchema.parse(key);
    requireThat(development, "FORBIDDEN", "Fault controls require development mode.", 403);
    requireThat(["SUCCESS","DECLINE","TIMEOUT_BEFORE_COMMIT","TIMEOUT_AFTER_COMMIT"].includes(mode), "INVALID_FAULT", "Unsupported fault mode.", 400);
    return transaction(this.db, principal.orgId, tx => idempotent(tx, principal, "payment.fault", key, { paymentId, mode }, async () => {
      const ref = (await tx.query("SELECT request_id FROM payments WHERE org_id=$1 AND id=$2", [principal.orgId, paymentId])).rows[0];
      requireThat(ref, "NOT_FOUND", "Payment not found.", 404);
      await requestRow(tx, principal, ref.request_id, true);
      const payment = (await tx.query("SELECT * FROM payments WHERE org_id=$1 AND id=$2 FOR UPDATE", [principal.orgId, paymentId])).rows[0];
      requireThat(!payment.dispatched_at && payment.hold_state === "HELD", "ALREADY_DISPATCHED", "Fault mode is locked after dispatch.", 409);
      await tx.query("UPDATE payments SET fault_mode=$3 WHERE org_id=$1 AND id=$2", [principal.orgId, paymentId, mode]);
      await appendAudit(tx, principal.orgId, principal.id, "payment.fault_selected", payment.request_id, { paymentId, mode });
      return { paymentId, faultMode: mode };
    }));
  }


  /** Bounded, scoped dashboard reads existing records; it never executes financial actions. */
  async dashboard(principal: Principal) {
    const catalog = await this.catalog(principal);
    return transaction(this.db, principal.orgId, async tx => {
      const rows = (await tx.query(`SELECT r.*,row_to_json(p) AS payment_row,row_to_json(a) AS approval_row,row_to_json(t) AS transaction_review,row_to_json(i) AS investigation_row
        FROM requests r LEFT JOIN payments p ON p.org_id=r.org_id AND p.request_id=r.id
        LEFT JOIN approvals a ON a.org_id=r.org_id AND a.request_id=r.id
        LEFT JOIN LATERAL (SELECT * FROM transaction_reviews WHERE org_id=r.org_id AND request_id=r.id ORDER BY request_version DESC LIMIT 1) t ON true
        LEFT JOIN investigations i ON i.org_id=r.org_id AND i.request_id=r.id
        WHERE r.org_id=$1 AND r.project_id IN (SELECT project_id FROM principal_projects WHERE org_id=$1 AND principal_id=$2)
        AND ($3<>'AGENT' OR r.agent_id IN (SELECT id FROM agents WHERE org_id=$1 AND owner_id=$2))
        ORDER BY r.created_at DESC,r.id DESC LIMIT 50`, [principal.orgId, principal.id, principal.role])).rows;
      const ids = rows.map(r => r.id);
      const events = (await tx.query(`SELECT * FROM audit_events WHERE org_id=$1 AND packet->>'resourceId'=ANY($2::text[]) ORDER BY sequence DESC LIMIT 100`, [principal.orgId, ids])).rows;
      return { catalog, requests: rows.map(r => ({ ...projection(r, r.payment_row, r.approval_row), transactionReview: r.transaction_review, investigation: r.investigation_row, snapshotHash: transactionSnapshot(r,r.payment_row) })), events,
        limits: { requests: 50, events: 100, exhaustive: false }, paymentExecution: false };
    });
  }

  async catalog(principal: Principal) {
    return transaction(this.db, principal.orgId, async tx => {
      const projects = (await tx.query("SELECT p.* FROM projects p JOIN principal_projects g ON g.org_id=p.org_id AND g.project_id=p.id WHERE g.org_id=$1 AND g.principal_id=$2", [principal.orgId, principal.id])).rows;
      const agents = (await tx.query(`SELECT a.*,EXISTS(SELECT 1 FROM credentials c WHERE c.org_id=a.org_id AND c.principal_id=a.owner_id AND c.revoked_at IS NULL AND 'request:submit'=ANY(c.capabilities)) AS can_purchase FROM agents a JOIN principal_projects g ON g.org_id=a.org_id AND g.project_id=a.project_id WHERE g.org_id=$1 AND g.principal_id=$2 AND ($3 NOT IN ('OPERATOR','AGENT') OR a.owner_id=$2)`, [principal.orgId, principal.id, principal.role])).rows;
      const budgets = (await tx.query("SELECT b.* FROM budgets b JOIN principal_projects g ON g.org_id=b.org_id AND g.project_id=b.project_id WHERE g.org_id=$1 AND g.principal_id=$2", [principal.orgId, principal.id])).rows;
      const merchants = (await tx.query("SELECT id,name,status FROM merchants WHERE org_id=$1", [principal.orgId])).rows;
      return { projects, agents, budgets, merchants, policy: POLICY, mode: "sandbox", provider: "simulator" };
    });
  }

  async search(principal: Principal, query: string) {
    requireThat(query.length >= 2 && query.length <= 200, "INVALID_QUERY", "Search requires 2–200 characters.", 400);
    return transaction(this.db, principal.orgId, async tx => (await tx.query(`SELECT s.id,s.domain,s.source_id,s.project_id,s.dataset_label,s.source_hash,s.content->>'title' AS title,s.content->>'kind' AS kind FROM source_records s
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

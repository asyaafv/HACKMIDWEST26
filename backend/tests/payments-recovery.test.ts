/** Isolated PostgreSQL checks provider persistence, retry accounting, and event deduplication. */
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type DB } from "../src/db.js";
import { migrate } from "../scripts/migrate.js";
import { seedControls } from "../scripts/seed.js";
import { GateService } from "../src/service.js";
import { GateWorker } from "../src/worker.js";
import type { Principal, Proposal } from "../src/contracts.js";

const port = 57000 + process.pid % 1000;
const pg = new EmbeddedPostgres({ databaseDir: `work/payments-postgres-${randomUUID()}`, user: "gate_payments_test", password: "unit_test_only", port,
  persistent: false, postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
let admin: DB, runtime: DB, service: GateService;
let operator: Principal, finance: Principal, proposal: Proposal;

beforeAll(async () => {
  await pg.initialise(); await pg.start(); await pg.createDatabase("gate_payments_test");
  const connectionString = `postgresql://gate_payments_test:unit_test_only@127.0.0.1:${port}/gate_payments_test`;
  admin = new Pool({ connectionString }); await migrate(admin);
  runtime = new Pool({ connectionString, options: "-c role=gate_runtime", max: 12 }); service = new GateService(runtime);
});
afterAll(async () => { await runtime?.end(); await admin?.end(); await pg.stop(); });
beforeEach(async () => {
  await admin.query("TRUNCATE organizations CASCADE");
  const controls = await seedControls(admin);
  const principal = async (role: "OPERATOR" | "FINANCE"): Promise<Principal> => ({
    id: controls.identities[role]!.id, orgId: controls.orgId, role,
    credentialId: (await admin.query("SELECT id FROM credentials WHERE principal_id=$1", [controls.identities[role]!.id])).rows[0].id,
    approvalLimitMinor: role === "FINANCE" ? "500000" : "0",
  });
  operator = await principal("OPERATOR"); finance = await principal("FINANCE");
  const primaryId = randomUUID(), relatedId = randomUUID();
  await admin.query("INSERT INTO source_records VALUES($1,$2,$3,'UNIT','manifest','pm','PAY-ISSUE','unit.json','','source-hash',$4)",
    [primaryId, controls.orgId, controls.projectId, { id: "PAY-ISSUE" }]);
  await admin.query("INSERT INTO source_records VALUES($1,$2,$3,'UNIT','manifest','crm','PAY-TICKET','unit.json','','source-hash',$4)",
    [relatedId, controls.orgId, controls.projectId, { id: "PAY-TICKET" }]);
  await admin.query("INSERT INTO source_links VALUES($1,$2,$3,'/ticket')", [controls.orgId, primaryId, relatedId]);
  proposal = { agentId: controls.agentId, projectId: controls.projectId, merchantId: controls.merchantId, amountMinor: "170000",
    currency: "USD", category: "diagnostics", purpose: "Recovery test", source: { domain: "pm", sourceId: "PAY-ISSUE" } };
});
async function authorized() {
  const request = await service.create(operator, proposal, randomUUID());
  const preview = await service.preview(finance, request.id, randomUUID());
  const consent = await service.consent(finance, request.id, { choice: "approve", previewId: preview.id, previewHash: preview.previewHash,
    expectedVersion: preview.expectedVersion, reason: "Independent test consent", reviewResolutions: preview.decision.reviewRequirements.map(r => r.code) }, randomUUID());
  return { request, paymentId: consent.paymentId! };
}
describe("payments recovery", () => {
  it("recovers original receipt after a lost response and processes duplicate late events once", async () => {
    const { paymentId } = await authorized();
    await service.setPaymentFault({ ...finance, role: "ADMIN" }, paymentId, "TIMEOUT_AFTER_COMMIT", randomUUID(), true);
    const worker = new GateWorker(runtime);
    await worker.runOnce();
    expect((await service.paymentDetail(finance, paymentId)).holdState).toBe("HELD");
    const recovery = await service.reconcilePayment(finance, paymentId, randomUUID());
    expect(recovery.recovered).toBe(true);
    await Promise.all(Array.from({ length: 8 }, () => worker.ingestSimulatorEvent(finance.orgId, paymentId, "event-1", "SUCCEEDED")));
    await worker.ingestSimulatorEvent(finance.orgId, paymentId, "event-0", "PROCESSING");
    expect((await admin.query("SELECT count(*) FROM budget_entries WHERE kind='CAPTURE'")).rows[0].count).toBe("1");
    expect((await admin.query("SELECT count(*) FROM simulator_transactions")).rows[0].count).toBe("1");
    expect((await admin.query("SELECT count(*) FROM payment_inbox")).rows[0].count).toBe("2");
  });
  it("releases a definitive decline once and rejects fault changes after dispatch", async () => {
    const { paymentId } = await authorized();
    await service.setPaymentFault({ ...finance, role: "ADMIN" }, paymentId, "DECLINE", randomUUID(), true);
    await new GateWorker(runtime).runOnce();
    expect((await service.paymentDetail(finance, paymentId)).holdState).toBe("RELEASED");
    await expect(service.setPaymentFault({ ...finance, role: "ADMIN" }, paymentId, "SUCCESS", randomUUID(), true))
      .rejects.toMatchObject({ code: "ALREADY_DISPATCHED" });
    expect((await admin.query("SELECT count(*) FROM budget_entries WHERE kind='RELEASE'")).rows[0].count).toBe("1");
  });
  it("requires fresh finance review for a distinct matching paid purchase", async () => {
    await authorized();
    await new GateWorker(runtime).runOnce();
    const second = await service.create(operator, proposal, randomUUID());
    expect(second.decision.reviewRequirements).toContainEqual({ code: "DUPLICATE_BUSINESS_INTENT", resolution: "HUMAN_JUDGMENT" });
    expect(second.decision.verdict).toBe("REVIEW");
  });
  it("flags a second recorded simulation before either request is approved or paid", async () => {
    const first = await service.create(operator, proposal, randomUUID(), "SIMULATED_PURCHASE");
    expect(first.decision.reviewRequirements.some((r: { code: string }) => r.code === "DUPLICATE_BUSINESS_INTENT")).toBe(false);
    const secondPreview = await service.previewProposal(operator, proposal);
    expect(secondPreview.decision.reviewRequirements).toContainEqual({ code: "DUPLICATE_BUSINESS_INTENT", resolution: "HUMAN_JUDGMENT" });
    const second = await service.create(operator, proposal, randomUUID(), "SIMULATED_PURCHASE");
    expect(second.id).not.toBe(first.id);
    expect(second.decision.factors).toContainEqual({ code: "DUPLICATE_INTENT", points: 20 });
    expect((await admin.query("SELECT count(*) FROM requests WHERE origin='SIMULATED_PURCHASE'")).rows[0].count).toBe("2");
    expect((await admin.query("SELECT count(*) FROM payments")).rows[0].count).toBe("0");
  });
  it("serializes concurrent finance consent against the live budget", async () => {
    await admin.query("UPDATE budgets SET limit_minor=250000");
    const requests = await Promise.all([service.create(operator, proposal, randomUUID()), service.create(operator, { ...proposal, purpose: "Separate budget race" }, randomUUID())]);
    const previews = await Promise.all(requests.map(r => service.preview(finance, r.id, randomUUID())));
    const results = await Promise.allSettled(requests.map((r, i) => service.consent(finance, r.id,
      { choice: "approve", previewId: previews[i]!.id, previewHash: previews[i]!.previewHash,
        expectedVersion: previews[i]!.expectedVersion, reason: "Concurrent test", reviewResolutions: previews[i]!.decision.reviewRequirements.map(r => r.code) }, randomUUID())));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await admin.query("SELECT reserved_minor FROM budgets")).rows[0].reserved_minor).toBe("170000");
  });
  it("expires an undispatched authorization and releases only once", async () => {
    const { paymentId } = await authorized();
    await admin.query("UPDATE payments SET expires_at=now()-interval '1 second' WHERE id=$1", [paymentId]);
    await new GateWorker(runtime).runOnce();
    await new GateWorker(runtime).runOnce();
    expect((await service.paymentDetail(finance, paymentId)).authorizationStatus).toBe("EXPIRED");
    expect((await admin.query("SELECT count(*) FROM budget_entries WHERE kind='RELEASE'")).rows[0].count).toBe("1");
  });
  it("keeps a hold and marks manual attention after bounded before-commit timeouts", async () => {
    const { paymentId } = await authorized();
    await service.setPaymentFault({ ...finance, role: "ADMIN" }, paymentId, "TIMEOUT_BEFORE_COMMIT", randomUUID(), true);
    for (let i=0;i<5;i++) { await new GateWorker(runtime).runOnce(); await admin.query("UPDATE jobs SET available_at=now(),lease_until=NULL WHERE payment_id=$1", [paymentId]); }
    const detail = await service.paymentDetail(finance, paymentId);
    expect(detail.holdState).toBe("HELD");
    expect(detail.job.manual_attention).toBe(true);
    expect(detail.attempts).toHaveLength(5);
    expect((await admin.query("SELECT count(*) FROM simulator_transactions")).rows[0].count).toBe("0");
  });
});

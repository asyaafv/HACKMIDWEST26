/** Durable simulator stores a result before returning, so lost responses recover the same receipt. */
import { randomUUID } from "node:crypto";
import type { DB } from "../db.js";
import { transaction } from "../db.js";
import { hash } from "../hash.js";
import { requireThat } from "../errors.js";
import type { PaymentOperation, PaymentProvider, ProviderReceipt } from "./provider.js";

export class SimulatorProvider implements PaymentProvider {
  readonly name = "simulator" as const;
  constructor(private db: DB) {}
  capabilities() { return { retrieveById: true, recoverByKey: true, cancel: false }; }
  async retrieve(operation: PaymentOperation): Promise<ProviderReceipt | null> {
    return transaction(this.db, operation.orgId, async tx => {
      const row = (await tx.query("SELECT * FROM simulator_transactions WHERE org_id=$1 AND payment_id=$2", [operation.orgId, operation.paymentId])).rows[0];
      if (!row) return null;
      requireThat(row.payload_hash === this.payloadHash(operation), "PROVIDER_CONFLICT", "Provider operation parameters changed.");
      return row.receipt as ProviderReceipt;
    });
  }
  async execute(operation: PaymentOperation): Promise<ProviderReceipt> {
    let created = false;
    const receipt = await transaction(this.db, operation.orgId, async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`simulator:${operation.orgId}:${operation.operationKey}`]);
      const existing = (await tx.query("SELECT * FROM simulator_transactions WHERE org_id=$1 AND payment_id=$2", [operation.orgId, operation.paymentId])).rows[0];
      const payloadHash = this.payloadHash(operation);
      if (existing) {
        requireThat(existing.payload_hash === payloadHash, "PROVIDER_CONFLICT", "Provider operation parameters changed.");
        return existing.receipt as ProviderReceipt;
      }
      if (operation.faultMode === "TIMEOUT_BEFORE_COMMIT") throw new Error("SIMULATED_TIMEOUT_BEFORE_COMMIT");
      created = true;
      const result: ProviderReceipt = { providerObjectId: randomUUID(), paymentId: operation.paymentId,
        amountMinor: operation.amountMinor, currency: "USD", destinationRef: operation.destinationRef,
        provider: "simulator", mode: "sandbox", label: "SIMULATED — NO MONEY MOVED",
        status: operation.faultMode === "DECLINE" ? "FAILED" : "SUCCEEDED", createdAt: new Date().toISOString() };
      await tx.query("INSERT INTO simulator_transactions VALUES($1,$2,$3,$4,$5,$6)",
        [result.providerObjectId, operation.orgId, operation.paymentId, payloadHash, result.status, result]);
      return result;
    });
    if (created && operation.faultMode === "TIMEOUT_AFTER_COMMIT") throw new Error("SIMULATED_TIMEOUT_AFTER_COMMIT");
    return receipt;
  }
  private payloadHash(operation: PaymentOperation) {
    return hash({ paymentId: operation.paymentId, amountMinor: operation.amountMinor, currency: "USD",
      destinationRef: operation.destinationRef, boundHash: operation.boundHash });
  }
}

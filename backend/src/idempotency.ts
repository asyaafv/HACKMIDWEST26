/** Transactional operation keys serialize retries before any domain mutation occurs. */
import type { Tx } from "./db.js";
import type { Principal } from "./contracts.js";
import { hash } from "./hash.js";
import { requireThat } from "./errors.js";

export async function idempotent<T>(tx: Tx, principal: Principal, operation: string, key: string, input: unknown, work: () => Promise<T>): Promise<T> {
  const digest = hash(input);
  // Hash collisions only serialize unrelated operations; the full composite key still identifies results.
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${principal.orgId}:${principal.id}:${operation}:${key}`]);
  const params = [principal.orgId, principal.id, operation, key];
  const existing = (await tx.query("SELECT * FROM idempotency_records WHERE org_id=$1 AND principal_id=$2 AND operation=$3 AND key=$4", params)).rows[0];
  if (existing) {
    requireThat(existing.request_hash === digest, "IDEMPOTENCY_CONFLICT", "This key already belongs to a different input.", 409);
    return existing.response as T;
  }
  const result = await work();
  await tx.query("INSERT INTO idempotency_records VALUES($1,$2,$3,$4,$5,$6)", [...params, digest, result]);
  return result;
}

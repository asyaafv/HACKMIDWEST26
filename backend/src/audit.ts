/** Append-only SHA-256 chain; locking its head serializes concurrent event ordering. */
import type { Tx } from "./db.js";
import { hash } from "./hash.js";

export async function appendAudit(tx: Tx, orgId: string, actorId: string | null, event: string, resourceId: string, details: unknown) {
  const head = (await tx.query("SELECT * FROM audit_heads WHERE org_id=$1 FOR UPDATE", [orgId])).rows[0];
  const sequence = (BigInt(head.sequence) + 1n).toString();
  const packet = { orgId, sequence, actorId, event, resourceId, details, createdAt: new Date().toISOString() };
  const eventHash = hash({ packet, prevHash: head.head_hash });
  await tx.query("INSERT INTO audit_events VALUES($1,$2,$3,$4,$5)", [orgId, sequence, packet, head.head_hash, eventHash]);
  await tx.query("UPDATE audit_heads SET sequence=$2,head_hash=$3 WHERE org_id=$1", [orgId, sequence, eventHash]);
}

export function verifyChain(rows: { sequence: string; packet: unknown; prev_hash: string; event_hash: string }[], expectedHead: string) {
  let previous = "GENESIS";
  let sequence = 0n;
  for (const row of rows) {
    sequence++;
    if (row.sequence !== sequence.toString() || row.prev_hash !== previous || hash({ packet: row.packet, prevHash: previous }) !== row.event_hash) return false;
    previous = row.event_hash;
  }
  return previous === expectedHead;
}

/** Recomputes stored event chains against each database head; external checkpoints remain future work. */
import { Pool } from "../src/db.js";
import { verifyChain } from "../src/audit.js";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const heads = (await db.query("SELECT * FROM audit_heads")).rows;
  for (const head of heads) {
    const rows = (await db.query("SELECT * FROM audit_events WHERE org_id=$1 ORDER BY sequence", [head.org_id])).rows;
    if (!verifyChain(rows, head.head_hash) || BigInt(head.sequence) !== BigInt(rows.length)) throw new Error("Audit verification failed");
  }
  console.log(`Verified ${heads.length} Gate audit chains.`);
} finally { await db.end(); }

/** Read-only accounting check compares immutable budget entries with each live counter. */
import { Pool } from "../src/db.js";
const db = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c role=gate_runtime" });
try {
  const orgs = (await db.query("SELECT * FROM gate_pending_orgs()")).rows;
  // Runtime RLS requires a tenant transaction; supplied org IDs can include settled budgets.
  const explicit = process.env.GATE_ORG_ID;
  if (!explicit) throw new Error("Set GATE_ORG_ID to the tenant UUID to verify.");
  const tx = await db.connect();
  try {
    await tx.query("BEGIN READ ONLY");
    await tx.query("SELECT set_config('gate.org_id',$1,true)", [explicit]);
    const budgets = (await tx.query(`SELECT b.id,b.reserved_minor,b.spent_minor,
      COALESCE(sum(CASE WHEN e.kind='RESERVE' THEN e.amount_minor WHEN e.kind IN ('CAPTURE','RELEASE') THEN -e.amount_minor ELSE 0 END),0)::text AS expected_reserved,
      COALESCE(sum(CASE WHEN e.kind='CAPTURE' THEN e.amount_minor ELSE 0 END),0)::text AS expected_spent
      FROM budgets b LEFT JOIN budget_entries e ON e.org_id=b.org_id AND e.budget_id=b.id
      WHERE b.org_id=$1 GROUP BY b.id`, [explicit])).rows;
    const invalid = budgets.filter(b => b.reserved_minor !== b.expected_reserved || b.spent_minor !== b.expected_spent);
    const entries = (await tx.query(`SELECT p.id FROM payments p LEFT JOIN budget_entries e ON e.org_id=p.org_id AND e.payment_id=p.id
      WHERE p.org_id=$1 GROUP BY p.id,p.hold_state HAVING count(*) FILTER (WHERE e.kind='RESERVE')<>1
      OR (p.hold_state='CAPTURED' AND count(*) FILTER (WHERE e.kind='CAPTURE')<>1)
      OR (p.hold_state='RELEASED' AND count(*) FILTER (WHERE e.kind='RELEASE')<>1)
      OR (p.hold_state='HELD' AND count(*) FILTER (WHERE e.kind IN ('CAPTURE','RELEASE'))<>0)`, [explicit])).rows;
    await tx.query("COMMIT");
    if (invalid.length || entries.length) throw new Error(`Ledger mismatch: ${invalid.length} budgets, ${entries.length} payments.`);
    console.log(`Verified ${budgets.length} budget counters; ${orgs.length} organizations have pending jobs.`);
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
} finally { await db.end(); }

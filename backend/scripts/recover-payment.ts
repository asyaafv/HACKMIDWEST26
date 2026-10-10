/** Manual recovery retrieves a dispatched simulator operation by its existing payment key. */
import { Pool } from "../src/db.js";
import { GateWorker } from "../src/worker.js";
const [orgId,paymentId] = process.argv.slice(2);
if (!orgId || !paymentId || !/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(paymentId)) {
  throw new Error("Usage: recover-payment <org-uuid> <payment-uuid>");
}
const db = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c role=gate_runtime" });
try { console.log(await new GateWorker(db).reconcile(orgId, paymentId)); }
finally { await db.end(); }

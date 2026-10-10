/** Worker process polls durable jobs; retry timing is persisted rather than held in memory. */
import { setTimeout } from "node:timers/promises";
import { Pool } from "./db.js";
import { configuration } from "./config.js";
import { GateWorker } from "./worker.js";

const config = configuration();
const db = new Pool({ connectionString: config.DATABASE_URL, options: "-c role=gate_runtime", max: 5 });
const worker = new GateWorker(db);
let stopped = false;
process.once("SIGINT", () => { stopped = true; });
process.once("SIGTERM", () => { stopped = true; });
while (!stopped) {
  try { if (!await worker.runOnce()) await setTimeout(1000); }
  catch { console.error("Gate worker dependency failure; retrying."); await setTimeout(5000); }
}
await db.end();

/** Worker process polls durable jobs; retry timing is persisted rather than held in memory. */
import { setTimeout } from "node:timers/promises";
import { Pool } from "./db.js";
import { configuration, trustSettings } from "./config.js";
import { GateService } from "./service.js";
import { TrustWorker } from "./trust-worker.js";
import { GateWorker } from "./worker.js";

const config = configuration();
const db = new Pool({ connectionString: config.DATABASE_URL, options: "-c role=gate_runtime", max: 5 });
const worker = new GateWorker(db);
const trust = new TrustWorker(db,new GateService(db),trustSettings(config));
let stopped = false;
process.once("SIGINT", () => { stopped = true; });
process.once("SIGTERM", () => { stopped = true; });
while (!stopped) {
  try { const assessed=await trust.runOnce(); const paid=await worker.runOnce(); if (!assessed && !paid) await setTimeout(1000); }
  catch { console.error("Gate worker dependency failure; retrying."); await setTimeout(5000); }
}
await db.end();

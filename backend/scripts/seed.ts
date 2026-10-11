/** Seeds demo controls and separate role credentials; it never fabricates enterprise evidence. */
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importEvidence } from "./import.js";
import { fileURLToPath } from "node:url";
import { Pool } from "../src/db.js";
import { secretHash } from "../src/hash.js";

export async function seedControls(db: InstanceType<typeof Pool>) {
  const orgId = randomUUID(), projectId = randomUUID(), agentId = randomUUID(), merchantId = randomUUID(), budgetId = randomUUID();
  const identities: Record<string, { id: string; token: string }> = {};
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("INSERT INTO organizations VALUES($1,'Gate sandbox')", [orgId]);
    await tx.query("INSERT INTO audit_heads(org_id) VALUES($1)", [orgId]);
    await tx.query("INSERT INTO projects VALUES($1,$2,'Sandbox incident response')", [projectId, orgId]);
    for (const identity of ["OPERATOR", "OPERATOR_B", "FINANCE", "AUDITOR", "ADMIN"]) {
      const role = identity === "OPERATOR_B" ? "OPERATOR" : identity;
      const id = randomUUID(), token = randomBytes(32).toString("hex");
      identities[identity] = { id, token };
      await tx.query("INSERT INTO principals(id,org_id,name,role,approval_limit_minor) VALUES($1,$2,$3,$4,$5)", [id, orgId, `Gate ${identity.toLowerCase()}`, role, role === "FINANCE" ? "500000" : "0"]);
      await tx.query("INSERT INTO credentials(id,org_id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '24 hours')", [randomUUID(), orgId, id, secretHash(token)]);
      await tx.query("INSERT INTO principal_projects VALUES($1,$2,$3)", [orgId, id, projectId]);
    }
    await tx.query("INSERT INTO agents(id,org_id,owner_id,project_id,name) VALUES($1,$2,$3,$4,'Gate diagnostics agent')", [agentId, orgId, identities.OPERATOR!.id, projectId]);
    await tx.query("INSERT INTO merchants VALUES($1,$2,'Sandbox diagnostics','ALLOWED','simulator:diagnostics',1)", [merchantId, orgId]);
    await tx.query("INSERT INTO budgets(id,org_id,project_id,period_start,period_end,limit_minor) VALUES($1,$2,$3,now()-interval '1 day',now()+interval '30 days',1000000)", [budgetId, orgId, projectId]);
    await tx.query("COMMIT");
    return { orgId, projectId, agentId, merchantId, budgetId, identities };
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
/** Repeatable preparation reuses the development organization and never touches requests or payments. */
export async function prepareDemo(db: InstanceType<typeof Pool>) {
  const existing = (await db.query("SELECT id FROM organizations WHERE name='Gate sandbox' ORDER BY id LIMIT 1")).rows[0];
  let controls: Awaited<ReturnType<typeof seedControls>> | undefined;
  if (!existing) controls = await seedControls(db);
  const orgId = controls?.orgId ?? existing.id as string;
  const mainProjectId = controls?.projectId ?? (await db.query("SELECT id FROM projects WHERE org_id=$1 AND name='Sandbox incident response'", [orgId])).rows[0]?.id;
  if (!mainProjectId) throw new Error("Development organization has no main project");
  let restrictedProjectId = (await db.query("SELECT id FROM projects WHERE org_id=$1 AND name='Restricted synthetic project'", [orgId])).rows[0]?.id;
  if (!restrictedProjectId) { restrictedProjectId = randomUUID(); await db.query("INSERT INTO projects VALUES($1,$2,'Restricted synthetic project')", [restrictedProjectId, orgId]); }
  const root = resolve("data/synthetic");
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  const imported = await importEvidence(db, orgId, mainProjectId, root, manifest, restrictedProjectId);
  // A separate immutable manifest extends existing installations without changing their source hashes.
  const expansionManifest = JSON.parse(await readFile(resolve(root, "expansion-manifest.json"), "utf8"));
  const expansion = await importEvidence(db, orgId, mainProjectId, root, expansionManifest, restrictedProjectId);
  if (controls) {
    await mkdir("work", { recursive: true, mode: 0o700 });
    await writeFile("work/demo-credentials.json", JSON.stringify({ ...controls, restrictedProjectId }, null, 2), { mode: 0o600, flag: "wx" });
  }
  return { orgId, projectId: mainProjectId, restrictedProjectId,
    records: imported.records + expansion.records, verifiedLinks: imported.verifiedLinks + expansion.verifiedLinks,
    datasets: [{ label: imported.datasetLabel, manifestHash: imported.manifestHash },
      { label: expansion.datasetLabel, manifestHash: expansion.manifestHash }] };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (process.argv.includes("--prepare")) console.log(await prepareDemo(db));
    else {
      const controls = await seedControls(db);
      await mkdir("work", { recursive: true, mode: 0o700 });
      await writeFile("work/demo-credentials.json", JSON.stringify(controls, null, 2), { mode: 0o600 });
      console.log("Gate controls seeded. Private credentials saved in ignored work/demo-credentials.json.");
    }
  } finally { await db.end(); }
}

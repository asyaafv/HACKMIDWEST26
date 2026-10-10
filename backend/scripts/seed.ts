/** Seeds demo controls and separate role credentials; it never fabricates enterprise evidence. */
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
    for (const role of ["OPERATOR", "FINANCE", "AUDITOR", "ADMIN"]) {
      const id = randomUUID(), token = randomBytes(32).toString("hex");
      identities[role] = { id, token };
      await tx.query("INSERT INTO principals(id,org_id,name,role,approval_limit_minor) VALUES($1,$2,$3,$4,$5)", [id, orgId, `Gate ${role.toLowerCase()}`, role, role === "FINANCE" ? "500000" : "0"]);
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const controls = await seedControls(db);
    await mkdir("work", { recursive: true });
    await writeFile("work/demo-credentials.json", JSON.stringify(controls, null, 2), { mode: 0o600 });
    console.log("Gate controls seeded. Private credentials saved in ignored work/demo-credentials.json. Enterprise evidence still requires import.");
  } finally { await db.end(); }
}

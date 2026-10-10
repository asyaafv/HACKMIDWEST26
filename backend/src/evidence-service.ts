/** Authorized source selectors and context for REST and Gatekeeper MCP adapters. */
import type { Tx } from "./db.js";
import type { Principal, Proposal } from "./contracts.js";
import { collectEvidence } from "./evidence.js";
import { hash } from "./hash.js";

export async function searchEvidence(tx: Tx, principal: Principal, query: string, limit = 20) {
  const bounded = Math.min(50, Math.max(1, limit));
  const rows = (await tx.query(`SELECT s.domain,s.source_id,s.project_id,s.dataset_label,s.source_hash,s.source_path,s.source_pointer
    FROM source_records s JOIN principal_projects pp ON pp.org_id=s.org_id AND pp.project_id=s.project_id
    WHERE s.org_id=$1 AND pp.principal_id=$2 AND (s.source_id ILIKE $3 OR s.content::text ILIKE $3)
    ORDER BY s.domain,s.source_id LIMIT $4`, [principal.orgId, principal.id, `%${query.replace(/[%_\\]/g, "\\$&")}%`, bounded])).rows;
  return { items: rows, limit: bounded, exhaustive: false };
}
export async function getSourceDetail(tx: Tx, principal: Principal, domain: Proposal["source"]["domain"], sourceId: string) {
  const row = (await tx.query(`SELECT s.* FROM source_records s JOIN principal_projects pp ON pp.org_id=s.org_id AND pp.project_id=s.project_id
    WHERE s.org_id=$1 AND pp.principal_id=$2 AND s.domain=$3 AND s.source_id=$4`, [principal.orgId, principal.id, domain, sourceId])).rows[0];
  if (!row) return null;
  return { id: row.id, domain: row.domain, sourceId: row.source_id, projectId: row.project_id, datasetVersion: row.dataset_label,
    manifestHash: row.manifest_hash, sourceHash: row.source_hash, contentHash: hash(row.content), locator: `${row.source_path}#${row.source_pointer}`, content: row.content };
}
export async function getSourceContext(tx: Tx, principal: Principal, projectId: string, source: Proposal["source"]) {
  const access = (await tx.query("SELECT 1 FROM principal_projects WHERE org_id=$1 AND principal_id=$2 AND project_id=$3", [principal.orgId, principal.id, projectId])).rowCount;
  if (!access) return null;
  return collectEvidence(tx, principal, { projectId, source } as Proposal);
}

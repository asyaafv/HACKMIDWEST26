/** Builds scoped evidence from imported records and explicit source-backed links only. */
import type { Tx } from "./db.js";
import type { Principal, Proposal } from "./contracts.js";
import { hash } from "./hash.js";

export async function collectEvidence(tx: Tx, principal: Principal, proposal: Proposal) {
  const primary = (await tx.query(`SELECT * FROM source_records WHERE org_id=$1 AND project_id=$2 AND domain=$3 AND source_id=$4`,
    [principal.orgId, proposal.projectId, proposal.source.domain, proposal.source.sourceId])).rows[0];
  if (!primary) return { complete: false, items: [], links: [], missing: ["PRIMARY_RECORD_UNAVAILABLE"], bundleHash: hash({ missing: proposal.source }) };
  const related = (await tx.query(`SELECT s.*,l.basis_pointer FROM source_links l JOIN source_records s ON s.org_id=l.org_id AND s.id=l.to_id
    WHERE l.org_id=$1 AND l.from_id=$2 AND s.project_id=$3 ORDER BY s.id LIMIT 20`, [principal.orgId, primary.id, proposal.projectId])).rows;
  const items = [primary, ...related].map(s => ({
    id: s.id, domain: s.domain, sourceId: s.source_id, datasetVersion: s.dataset_label,
    manifestHash: s.manifest_hash, sourceHash: s.source_hash, path: s.source_path,
    pointer: s.source_pointer, content: s.content,
  }));
  const links = related.map(s => ({ fromId: primary.id, toId: s.id, basisPointer: s.basis_pointer, relationship: "EXPLICIT_REFERENCE" }));
  const missing = related.length ? [] : ["VERIFIED_RELATED_CONTEXT_MISSING"];
  const bundle = { complete: related.length > 0, items, links, missing };
  return { ...bundle, bundleHash: hash(bundle) };
}

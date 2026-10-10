/** Builds bounded, tenant-scoped evidence from explicit source-backed relations. */
import type { Tx } from "./db.js";
import type { Principal, Proposal } from "./contracts.js";
import { hash } from "./hash.js";

type Source = { id: string; org_id: string; project_id: string; domain: string; source_id: string; dataset_label: string; manifest_hash: string; source_hash: string; source_path: string; source_pointer: string; content: Record<string, unknown> };
type Edge = { from_id: string; to_id: string; basis_pointer: string; relationship: string; target: Source };
const MAX_ITEMS = 20;
const MAX_DEPTH = 3;
const REFERENCE_TIME = "2026-10-10T12:00:00Z";

export async function collectEvidence(tx: Tx, principal: Principal, proposal: Proposal) {
  const primary = (await tx.query<Source>(`SELECT * FROM source_records WHERE org_id=$1 AND project_id=$2 AND domain=$3 AND source_id=$4`, [principal.orgId, proposal.projectId, proposal.source.domain, proposal.source.sourceId])).rows[0];
  if (!primary) return { complete: false, items: [], links: [], missing: ["PRIMARY_RECORD_UNAVAILABLE"], unresolvedRequirements: ["PRIMARY_RECORD_UNAVAILABLE"], coverage: { status: "PARTIAL", depth: 0, bounded: true }, bundleHash: hash({ missing: proposal.source }) };
  const visited = new Map<string, Source>([[primary.id, primary]]);
  const links: { fromId: string; toId: string; basisPointer: string; relationship: string }[] = [];
  let frontier = [primary.id];
  let bounded = false;
  let depth = 0;
  while (frontier.length && depth < MAX_DEPTH) {
    const edges = (await tx.query<Edge>(`SELECT l.from_id,l.to_id,l.basis_pointer,COALESCE(t.relationship,'EXPLICIT_REFERENCE') AS relationship, row_to_json(s.*) AS target
      FROM source_links l JOIN source_records s ON s.org_id=l.org_id AND s.id=l.to_id
      LEFT JOIN source_link_types t ON t.org_id=l.org_id AND t.from_id=l.from_id AND t.to_id=l.to_id
      WHERE l.org_id=$1 AND l.from_id=ANY($2::uuid[]) AND s.project_id=$3
      ORDER BY l.from_id,l.to_id LIMIT 101`, [principal.orgId, frontier, proposal.projectId])).rows;
    if (edges.length > 100) bounded = true;
    const next: string[] = [];
    for (const edge of edges.slice(0,100)) {
      if (!visited.has(edge.to_id) && visited.size >= MAX_ITEMS) { bounded = true; continue; }
      links.push({ fromId: edge.from_id, toId: edge.to_id, basisPointer: edge.basis_pointer, relationship: edge.relationship });
      if (!visited.has(edge.to_id)) { visited.set(edge.to_id, edge.target); next.push(edge.to_id); }
    }
    frontier = next;
    depth++;
  }
  if (frontier.length) bounded = true;
  const ticketIds = new Set(links.filter(l => l.fromId === primary.id && l.relationship === "ISSUE_TICKET").map(l => l.toId));
  if (ticketIds.size) {
    // Supporting documents point to tickets; include them as context, never as a causal issue edge.
    const documents = (await tx.query<{ from_id: string; to_id: string; basis_pointer: string; document: Source }>(`SELECT l.from_id,l.to_id,l.basis_pointer,row_to_json(d.*) AS document
      FROM source_link_types t JOIN source_links l ON l.org_id=t.org_id AND l.from_id=t.from_id AND l.to_id=t.to_id
      JOIN source_records d ON d.org_id=l.org_id AND d.id=l.from_id
      WHERE l.org_id=$1 AND l.to_id=ANY($2::uuid[]) AND t.relationship='DOCUMENT_TICKET' AND d.project_id=$3
      ORDER BY l.from_id LIMIT 21`, [principal.orgId, [...ticketIds], proposal.projectId])).rows;
    if (documents.length > 20) bounded = true;
    for (const doc of documents.slice(0, 20)) {
      if (visited.size >= MAX_ITEMS) { bounded = true; break; }
      if (!visited.has(doc.from_id)) visited.set(doc.from_id, doc.document);
      links.push({ fromId: doc.from_id, toId: doc.to_id, basisPointer: doc.basis_pointer, relationship: "DOCUMENT_TICKET" });
    }
  }
  const sources = [...visited.values()];
  const items = sources.map(s => ({ id: s.id, domain: s.domain, sourceId: s.source_id, datasetVersion: s.dataset_label,
    manifestHash: s.manifest_hash, sourceHash: s.source_hash, contentHash: hash(s.content), path: s.source_path,
    pointer: s.source_pointer, locator: `${s.source_path}#${s.source_pointer}`, content: s.content }));
  const hasAccount = links.some(l => ticketIds.has(l.fromId) && l.relationship === "TICKET_ACCOUNT" && visited.get(l.toId)?.content.kind === "account");
  const missing: string[] = [];
  if ((links.some(l => l.relationship !== "EXPLICIT_REFERENCE") && (!ticketIds.size || !hasAccount)) || links.length === 0) missing.push("VERIFIED_RELATED_CONTEXT_MISSING");
  if (bounded) missing.push("COVERAGE_BOUND_EXCEEDED");
  const unresolvedRequirements = [...missing];
  // Structured facts with equal timestamps and opposing values cannot be resolved by prose.
  for (const source of sources) {
    const facts = Array.isArray(source.content.facts) ? source.content.facts as Record<string, unknown>[] : [];
    const seen = new Map<string, unknown>();
    for (const fact of facts) {
      const key = `${fact.key}:${fact.observedAt}`;
      if (seen.has(key) && seen.get(key) !== fact.value) unresolvedRequirements.push(`CONTRADICTORY_FACT:${source.source_id}:${String(fact.key)}`);
      seen.set(key, fact.value);
    }
  }
  const observedAt = primary.content.observedAt;
  if (typeof observedAt === "string" && Date.parse(REFERENCE_TIME) - Date.parse(observedAt) > 30 * 24 * 60 * 60 * 1000) unresolvedRequirements.push(`STALE_PRIMARY:${primary.source_id}`);
  const complete = unresolvedRequirements.length === 0;
  const bundle = { complete, items, links, missing, unresolvedRequirements, coverage: { status: complete ? "COMPLETE" : "PARTIAL", depth, bounded }, referenceTime: REFERENCE_TIME };
  return { ...bundle, bundleHash: hash(bundle) };
}

/** Verifies and idempotently imports versioned synthetic records and explicit relationships. */
import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Pool } from "../src/db.js";
import { hash } from "../src/hash.js";

const ref = z.object({ domain: z.enum(["pm", "crm", "document"]), sourceId: z.string().min(1), pointer: z.string(), relationship: z.enum(["ISSUE_TICKET", "TICKET_ACCOUNT", "DOCUMENT_TICKET", "EXPLICIT_REFERENCE"]).optional() }).strict();
const mappingSchema = z.object({
  datasetLabel: z.string().min(1), datasetVersion: z.string().optional(), referenceTime: z.string().datetime().optional(),
  files: z.array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1),
  records: z.array(z.object({ domain: z.enum(["pm", "crm", "document"]), sourceId: z.string().min(1), project: z.enum(["main", "restricted"]).optional(), path: z.string().min(1), pointer: z.string(), idPointer: z.string(), links: z.array(ref).default([]) }).strict()).min(1),
}).strict();
export type EvidenceMapping = z.infer<typeof mappingSchema>;

export function jsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) throw new Error("JSON pointers must be empty or start with /");
  return pointer.slice(1).split("/").reduce<unknown>((current, key) => {
    const decoded = key.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || typeof current !== "object" || !Object.hasOwn(current, decoded)) throw new Error("Source pointer does not resolve");
    return (current as Record<string, unknown>)[decoded];
  }, value);
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
// UUIDs derive from dataset and source selectors, so a repeated preparation keeps citations stable.
export function stableSourceId(label: string, domain: string, sourceId: string) {
  const hex = createHash("sha256").update(`${label}:${domain}:${sourceId}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export async function importEvidence(db: InstanceType<typeof Pool>, orgId: string, projectId: string, rootInput: string, mappingInput: unknown, restrictedProjectId?: string) {
  const mapping = mappingSchema.parse(mappingInput);
  if (/unit_test|fixture/i.test(mapping.datasetLabel)) throw new Error("Test fixtures cannot be imported as enterprise evidence");
  const root = await realpath(rootInput);
  const files = new Map<string, { data: unknown; sha256: string }>();
  for (const file of mapping.files) {
    const path = await realpath(resolve(root, file.path));
    const rel = relative(root, path);
    if (isAbsolute(file.path) || rel.startsWith("..") || isAbsolute(rel) || !file.path.endsWith(".json") || /(^|\/)(tasks|tests|reference_trajectories|graders)(\/|$)/.test(file.path)) throw new Error("Only approved JSON business sources inside the data root are supported");
    const bytes = await readFile(path);
    const sha256 = digest(bytes);
    if (sha256 !== file.sha256) throw new Error("Source checksum mismatch");
    files.set(file.path, { data: JSON.parse(bytes.toString("utf8")), sha256 });
  }
  const records = mapping.records.map(record => {
    const file = files.get(record.path);
    if (!file) throw new Error("Record file not in manifest");
    const content = jsonPointer(file.data, record.pointer);
    if (jsonPointer(content, record.idPointer) !== record.sourceId) throw new Error("Source ID does not match original record");
    if (JSON.stringify(content).length > 16000) throw new Error("Record exceeds bounded preview limit");
    return { ...record, content, sha256: file.sha256, contentHash: hash(content), id: stableSourceId(mapping.datasetLabel, record.domain, record.sourceId), projectId: record.project === "restricted" ? restrictedProjectId : projectId };
  });
  const lookup = new Map(records.map(record => [`${record.domain}:${record.sourceId}`, record]));
  if (lookup.size !== records.length) throw new Error("Duplicate source IDs in mapping");
  const links = records.flatMap(record => record.links.map(link => {
    const target = lookup.get(`${link.domain}:${link.sourceId}`);
    if (!target || jsonPointer(record.content, link.pointer) !== link.sourceId || target.id === record.id) throw new Error("Relationship is not supported by an explicit source ID");
    if (record.projectId !== target.projectId) throw new Error("Cross-project relationship is forbidden");
    return { from: record.id, to: target.id, pointer: link.pointer, relationship: link.relationship ?? "EXPLICIT_REFERENCE" };
  }));
  const manifestHash = hash(mapping);
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const projectIds = [...new Set(records.map(r => r.projectId))];
    if (projectIds.includes(undefined)) throw new Error("Restricted project ID required");
    for (const id of projectIds) if (!(await tx.query("SELECT 1 FROM projects WHERE org_id=$1 AND id=$2", [orgId, id])).rowCount) throw new Error("Unknown tenant project");
    for (const record of records) {
      const existing = (await tx.query("SELECT id,project_id,dataset_label,manifest_hash,source_hash,content FROM source_records WHERE org_id=$1 AND domain=$2 AND source_id=$3", [orgId, record.domain, record.sourceId])).rows[0];
      if (existing) {
        if (existing.id !== record.id || existing.project_id !== record.projectId || existing.dataset_label !== mapping.datasetLabel || existing.manifest_hash !== manifestHash || existing.source_hash !== record.sha256 || hash(existing.content) !== record.contentHash) throw new Error(`Imported source drift: ${record.sourceId}`);
        continue;
      }
      await tx.query(`INSERT INTO source_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [record.id, orgId, record.projectId, mapping.datasetLabel, manifestHash, record.domain, record.sourceId, record.path, record.pointer, record.sha256, record.content]);
    }
    for (const link of links) {
      const prior = (await tx.query("SELECT l.basis_pointer,COALESCE(t.relationship,'EXPLICIT_REFERENCE') AS relationship FROM source_links l LEFT JOIN source_link_types t ON t.org_id=l.org_id AND t.from_id=l.from_id AND t.to_id=l.to_id WHERE l.org_id=$1 AND l.from_id=$2 AND l.to_id=$3", [orgId, link.from, link.to])).rows[0];
      if (prior) { if (prior.basis_pointer !== link.pointer || prior.relationship !== link.relationship) throw new Error("Imported relationship drift"); continue; }
      await tx.query("INSERT INTO source_links VALUES($1,$2,$3,$4)", [orgId, link.from, link.to, link.pointer]);
      if (link.relationship !== "EXPLICIT_REFERENCE") await tx.query("INSERT INTO source_link_types VALUES($1,$2,$3,$4)", [orgId, link.from, link.to, link.relationship]);
    }
    await tx.query("COMMIT");
    return { records: records.length, verifiedLinks: links.length, datasetLabel: mapping.datasetLabel, manifestHash };
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [orgId, projectId, root, mappingPath, restrictedProjectId] = process.argv.slice(2);
  if (!orgId || !projectId || !root || !mappingPath) throw new Error("Usage: data:import -- <orgId> <projectId> <root> <manifest.json> [restrictedProjectId]");
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try { console.log(await importEvidence(db, orgId, projectId, root, JSON.parse(await readFile(mappingPath, "utf8")), restrictedProjectId)); } finally { await db.end(); }
}

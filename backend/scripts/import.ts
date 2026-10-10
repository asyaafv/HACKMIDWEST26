/** Imports approved JSON exports only after file hashes, safe paths, pointers, and explicit links verify. */
import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Pool } from "../src/db.js";
import { hash, secretHash } from "../src/hash.js";

const mappingSchema = z.object({
  datasetLabel: z.string().min(1),
  files: z.array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1),
  records: z.array(z.object({ domain: z.enum(["pm", "crm", "document"]), sourceId: z.string().min(1),
    path: z.string().min(1), pointer: z.string(), idPointer: z.string(),
    links: z.array(z.object({ domain: z.enum(["pm", "crm", "document"]), sourceId: z.string().min(1), pointer: z.string() }).strict()).default([]),
  }).strict()).min(1),
}).strict();

export function jsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) throw new Error("JSON pointers must be empty or start with /");
  return pointer.slice(1).split("/").reduce<unknown>((current, key) => {
    const decoded = key.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || typeof current !== "object" || !Object.hasOwn(current, decoded)) throw new Error("Source pointer does not resolve");
    return (current as Record<string, unknown>)[decoded];
  }, value);
}

export async function importEvidence(db: InstanceType<typeof Pool>, orgId: string, projectId: string, rootInput: string, mappingInput: unknown) {
  const mapping = mappingSchema.parse(mappingInput);
  if (/unit_test|fixture/i.test(mapping.datasetLabel)) throw new Error("Test fixtures cannot be imported as enterprise evidence");
  const root = await realpath(rootInput);
  const files = new Map<string, { data: unknown; sha256: string }>();
  for (const file of mapping.files) {
    const path = await realpath(resolve(root, file.path));
    const rel = relative(root, path);
    if (isAbsolute(file.path) || rel.startsWith("..") || isAbsolute(rel) || !file.path.endsWith(".json") || /(^|\/)(tasks|tests|reference_trajectories|graders)(\/|$)/.test(file.path)) throw new Error("Only approved JSON business sources inside the data root are supported");
    const bytes = await readFile(path);
    const sha256 = secretHash(bytes.toString("utf8"));
    if (sha256 !== file.sha256) throw new Error("Source checksum mismatch");
    files.set(file.path, { data: JSON.parse(bytes.toString("utf8")), sha256 });
  }
  const records = mapping.records.map(record => {
    const file = files.get(record.path);
    if (!file) throw new Error("Record file not in manifest");
    const content = jsonPointer(file.data, record.pointer);
    if (jsonPointer(content, record.idPointer) !== record.sourceId) throw new Error("Source ID does not match original record");
    if (JSON.stringify(content).length > 16000) throw new Error("Record exceeds bounded preview limit; create an approved structured adapter");
    return { ...record, content, sha256: file.sha256, id: randomUUID() };
  });
  const lookup = new Map(records.map(record => [`${record.domain}:${record.sourceId}`, record]));
  if (lookup.size !== records.length) throw new Error("Duplicate source IDs in mapping");
  const links = records.flatMap(record => record.links.map(link => {
    const target = lookup.get(`${link.domain}:${link.sourceId}`);
    if (!target || jsonPointer(record.content, link.pointer) !== link.sourceId || target.id === record.id) throw new Error("Relationship is not supported by an explicit source ID");
    return { from: record.id, to: target.id, pointer: link.pointer };
  }));
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    if (!(await tx.query("SELECT 1 FROM projects WHERE org_id=$1 AND id=$2", [orgId, projectId])).rowCount) throw new Error("Unknown tenant project");
    for (const record of records) await tx.query(`INSERT INTO source_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [record.id, orgId, projectId, mapping.datasetLabel, hash(mapping), record.domain, record.sourceId, record.path, record.pointer, record.sha256, record.content]);
    for (const link of links) await tx.query("INSERT INTO source_links VALUES($1,$2,$3,$4)", [orgId, link.from, link.to, link.pointer]);
    await tx.query("COMMIT");
    return { records: records.length, verifiedLinks: links.length, datasetLabel: mapping.datasetLabel, manifestHash: hash(mapping) };
  } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [orgId, projectId, root, mappingPath] = process.argv.slice(2);
  if (!orgId || !projectId || !root || !mappingPath) throw new Error("Usage: data:import -- <orgId> <projectId> <approved-root> <mapping.json>");
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try { console.log(await importEvidence(db, orgId, projectId, root, JSON.parse(await readFile(mappingPath, "utf8")))); } finally { await db.end(); }
}

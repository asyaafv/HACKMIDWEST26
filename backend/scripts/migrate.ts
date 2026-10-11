/** Applies versioned SQL atomically under an advisory lock; modified applied migrations fail. */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "../src/db.js";
import { secretHash } from "../src/hash.js";

export async function migrate(db: InstanceType<typeof Pool>) {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(87492301)");
    await tx.query("CREATE TABLE IF NOT EXISTS gate_migrations(name text PRIMARY KEY, checksum text NOT NULL)");
    // Source runs from scripts/, compiled output runs from dist/scripts/.
    const sourceDirectory = new URL("../migrations/", import.meta.url);
    let directory = sourceDirectory;
    try { await readdir(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      directory = new URL("../../migrations/", import.meta.url);
    }
    for (const name of (await readdir(directory)).filter(n => n.endsWith(".sql")).sort()) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const checksum = secretHash(sql);
      const existing = (await tx.query("SELECT checksum FROM gate_migrations WHERE name=$1", [name])).rows[0];
      if (existing) { if (existing.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`); continue; }
      await tx.query(sql);
      await tx.query("INSERT INTO gate_migrations VALUES($1,$2)", [name, checksum]);
    }
    await tx.query("COMMIT");
  } catch (error) { await tx.query("ROLLBACK"); throw error; }
  finally { tx.release(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await migrate(db); console.log("Gate migrations applied."); } finally { await db.end(); }
}

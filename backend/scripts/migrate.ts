/** Applies versioned SQL atomically under an advisory lock; modified applied migrations fail. */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "../src/db.js";
import { secretHash } from "../src/hash.js";

async function migrationDirectory() {
  const source=new URL('../migrations/',import.meta.url);
  try{await readdir(source);return source;}catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    return new URL('../../migrations/',import.meta.url);
  }
}
/** Deployment preflight: reads the migration ledger; never applies SQL or creates tables. */
export async function inspectMigrations(db:InstanceType<typeof Pool>) {
  const directory=await migrationDirectory();
  const files=(await readdir(directory)).filter(n=>n.endsWith('.sql')).sort();
  const exists=(await db.query("SELECT to_regclass('public.gate_migrations') AS ledger")).rows[0]?.ledger;
  const applied=exists?(await db.query('SELECT name,checksum FROM gate_migrations ORDER BY name')).rows:[];
  const pending=files.filter(name=>!applied.some(row=>row.name===name));
  const changed:string[]=[];
  for(const row of applied)if(!files.includes(row.name)||secretHash(await readFile(new URL(row.name,directory),'utf8'))!==row.checksum)changed.push(row.name);
  return {applied:applied.map(row=>row.name),pending,changed};
}

export async function migrate(db: InstanceType<typeof Pool>) {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(87492301)");
    await tx.query("CREATE TABLE IF NOT EXISTS gate_migrations(name text PRIMARY KEY, checksum text NOT NULL)");
    // Source runs from scripts/, compiled output runs from dist/scripts/.
    const directory=await migrationDirectory();
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
  const check=process.argv.includes('--check');
  const db = new Pool({ connectionString: process.env.DATABASE_URL,...(check?{options:'-c default_transaction_read_only=on'}:{}) });
  try {
    if(check){const report=await inspectMigrations(db);console.log(JSON.stringify(report,null,2));if(report.changed.length)process.exitCode=1;}
    else {await migrate(db);console.log("Gate migrations applied.");}
  } finally { await db.end(); }
}

/** Starts a loopback-only PostgreSQL development cluster within ignored backend/work. */
import EmbeddedPostgres from "embedded-postgres";
import { access } from "node:fs/promises";

// Keep native clusters separate: PostgreSQL data directories are not portable
// between POSIX and Windows builds. Existing files in either location remain intact.
const databaseDir = process.platform === "win32" ? "work/postgres-windows" : "work/postgres";
const postgres = new EmbeddedPostgres({ databaseDir, user: "gate", password: "gate_local_only", port: 55432,
  persistent: true, postgresFlags: ["-h", "127.0.0.1"], onLog: message => process.stderr.write(message), onError: error => console.error(error) });
try { await access(`${databaseDir}/PG_VERSION`); } catch { await postgres.initialise(); }
await postgres.start();
const client = postgres.getPgClient();
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='gate'")).rowCount) await postgres.createDatabase("gate");
await client.end();
console.log("Gate local PostgreSQL ready on 127.0.0.1:55432. Keep this process running.");
const stop = async () => { await postgres.stop(); process.exit(0); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
await new Promise(() => {});

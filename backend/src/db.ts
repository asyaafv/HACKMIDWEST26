/** PostgreSQL transactions pin tenant context to one connection, never to the pool. */
import pg from "pg";
export const { Pool } = pg;
export type DB = pg.Pool;
export type Tx = pg.PoolClient;

export async function transaction<T>(db: DB, orgId: string, operation: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT set_config('gate.org_id', $1, true)", [orgId]);
    const result = await operation(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}

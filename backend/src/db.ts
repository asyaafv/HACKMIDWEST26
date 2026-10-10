/** PostgreSQL transactions pin tenant context to one connection, never to the pool. */
import pg from "pg";
/** pg-pool resolves end before idle sockets close; await remove events before stopping PostgreSQL. */
export class Pool extends pg.Pool {
  override end(): Promise<void>;
  override end(callback: () => void): void;
  override end(callback?: (error?: Error) => void): Promise<void> | void {
    let remaining = this.totalCount;
    let complete!: () => void;
    const closed = new Promise<void>(resolve => { complete = resolve; });
    if (!remaining) complete();
    const removed = () => { if (--remaining <= 0) complete(); };
    this.on("remove", removed);
    const result = super.end().then(() => closed).finally(() => this.off("remove", removed));
    if (callback) { void result.then(() => callback(), error => callback(error)); return; }
    return result;
  }
}
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

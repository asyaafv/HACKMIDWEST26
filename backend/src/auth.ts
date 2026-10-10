/** Hashed bearer credentials resolve server-owned identities; project grants bound every read. */
import type { DB, Tx } from "./db.js";
import type { Principal } from "./contracts.js";
import { secretHash } from "./hash.js";
import { requireThat } from "./errors.js";

export async function authenticate(db: DB, authorization?: string): Promise<Principal> {
  requireThat(typeof authorization === "string" && authorization.startsWith("Bearer "), "UNAUTHENTICATED", "A valid bearer credential is required.", 401);
  const token = authorization.slice(7);
  requireThat(token.length >= 32 && token.length <= 256, "UNAUTHENTICATED", "Invalid credential.", 401);
  const row = (await db.query("SELECT * FROM gate_authenticate($1)", [secretHash(token)])).rows[0];
  requireThat(row, "UNAUTHENTICATED", "Invalid or expired credential.", 401);
  return { id: row.id, orgId: row.org_id, credentialId: row.credential_id, role: row.role, approvalLimitMinor: row.approval_limit_minor };
}
export async function projectAccess(tx: Tx, principal: Principal, projectId: string) {
  const row = (await tx.query("SELECT 1 FROM principal_projects WHERE org_id=$1 AND principal_id=$2 AND project_id=$3", [principal.orgId, principal.id, projectId])).rows[0];
  requireThat(row, "NOT_FOUND", "Resource not found.", 404);
}
export function roleAccess(principal: Principal, roles: Principal["role"][]) {
  requireThat(roles.includes(principal.role), "FORBIDDEN", "Your role cannot perform this action.", 403);
}

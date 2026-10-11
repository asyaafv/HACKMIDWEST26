/** Optional DevRev Computer MCP identity bridge, restricted to one DevRev user and one Gate credential. */
import type { DB } from "./db.js";
import type { ScopedPrincipal } from "./capabilities.js";
import { normalizeCapabilities } from "./capabilities.js";
import { requireThat } from "./errors.js";

export type DevRevMcpIdentity = { email: string; orgId: string; credentialId: string };

export async function authenticateDevRevMcp(db: DB, authorization: string | undefined, binding: DevRevMcpIdentity): Promise<ScopedPrincipal> {
  requireThat(typeof authorization === "string" && authorization.startsWith("Bearer "), "UNAUTHENTICATED", "A valid bearer credential is required.", 401);
  const token = authorization.slice(7);
  requireThat(token.length >= 32 && token.length <= 4096 && !/[\r\n]/.test(token), "UNAUTHENTICATED", "Invalid credential.", 401);
  let user: { id?: string; email?: string } | undefined;
  try {
    const response = await fetch("https://api.devrev.ai/dev-users.self", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) user = (await response.json() as { dev_user?: { id?: string; email?: string } }).dev_user;
  } catch { /* Fail closed on DevRev errors and timeouts. */ }
  requireThat(user?.email?.toLowerCase() === binding.email.toLowerCase() && user.id?.includes(`:devo/${binding.orgId}:devu/`), "UNAUTHENTICATED", "Invalid credential.", 401);
  const row = (await db.query("SELECT * FROM gate_credential_identity($1)", [binding.credentialId])).rows[0];
  requireThat(row?.role === "AGENT", "UNAUTHENTICATED", "Invalid or expired credential.", 401);
  const capabilities = (await db.query("SELECT gate_credential_capabilities($1) AS capabilities", [row.credential_id])).rows[0]?.capabilities;
  requireThat(capabilities, "UNAUTHENTICATED", "Invalid or expired credential.", 401);
  return { capabilities: normalizeCapabilities(capabilities), authMethod: "bearer", id: row.id, orgId: row.org_id, credentialId: row.credential_id, role: row.role, approvalLimitMinor: row.approval_limit_minor };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateDevRevMcp } from "../src/devrev-auth.js";
import type { DB } from "../src/db.js";

const binding = { email: "gate@example.com", orgId: "team-org", credentialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const authorization = `Bearer ${"jwt-part.".repeat(8)}`;
const db = { query: vi.fn(async (sql: string) => ({ rows: sql.includes("gate_credential_identity")
  ? [{ id: "agent", org_id: "gate-org", credential_id: binding.credentialId, role: "AGENT", approval_limit_minor: 0 }]
  : [{ capabilities: ["catalog:read", "context:read"] }] })) } as unknown as DB;

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("DevRev MCP identity bridge", () => {
  it("uses the exact verified DevRev user and the preselected Gate agent credential", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ dev_user: { id: "don:identity:dvrv-us-1:devo/team-org:devu/123", email: "gate@example.com" } }), { status: 200 })));
    const principal = await authenticateDevRevMcp(db, authorization, binding);
    expect(principal.id).toBe("agent");
    expect(principal.role).toBe("AGENT");
    expect(principal.capabilities).toEqual(["catalog:read", "context:read"]);
    expect((db.query as any).mock.calls[0][1]).toEqual([binding.credentialId]);
  });

  it("rejects a different DevRev user before any Gate database lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ dev_user: { id: "don:identity:dvrv-us-1:devo/team-org:devu/123", email: "other@example.com" } }), { status: 200 })));
    await expect(authenticateDevRevMcp(db, authorization, binding)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects an invalid DevRev credential", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(authenticateDevRevMcp(db, authorization, binding)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(db.query).not.toHaveBeenCalled();
  });
});

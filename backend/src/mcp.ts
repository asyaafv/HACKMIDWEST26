/** Stateless Gate MCP transport delegates to REST's services; chat never supplies finance identity. */
import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { DB } from "./db.js";
import type { GateService } from "./service.js";
import { authenticate } from "./auth.js";
import { proposalSchema, idSchema, keySchema } from "./contracts.js";
import { GateError, requireThat } from "./errors.js";

export function attachMcp(app: FastifyInstance, db: DB, service: GateService, allowedHosts: string[]) {
  app.route({ method: ["GET", "POST", "DELETE"], url: "/mcp", handler: async (req, reply) => {
    requireThat(allowedHosts.includes(req.headers.host ?? ""), "HOST_FORBIDDEN", "MCP host not allowed.", 403);
    const principal = await authenticate(db, req.headers.authorization);
    if (req.method !== "POST") return reply.code(405).header("Allow", "POST").send({ error: "Stateless MCP accepts POST only." });
    const server = new McpServer({ name: "Gate", version: "0.1.0" });
    const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    const result = async (work: () => Promise<unknown>) => {
      try {
        const data = await work();
        const text = JSON.stringify({ data, mode: "sandbox", provider: "simulator" });
        requireThat(Buffer.byteLength(text) <= 32768, "OUTPUT_LIMIT", "Output too large; inspect the request through the scoped API.");
        return { content: [{ type: "text" as const, text }], structuredContent: { data, mode: "sandbox", provider: "simulator" } };
      } catch (error) {
        const code = error instanceof GateError ? error.code : error instanceof ZodError ? "INVALID_INPUT" : "DEPENDENCY_FAILURE";
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message: error instanceof GateError ? error.message : "Tool could not complete." } }) }] };
      }
    };
    server.registerTool("gate_capabilities", { description: "Read authenticated role, sandbox mode, and available workflow boundaries.", inputSchema: z.object({}).strict(), annotations: read }, () => result(async () => ({ role: principal.role, financeConsent: "authenticated REST only", liveDevrevConnection: false, evidence: "approved server import required" })));
    server.registerTool("gate_search_context", { description: "Search allowed imported source IDs/content; results are bounded, not exhaustive.", inputSchema: z.object({ query: z.string().min(2).max(200) }).strict(), annotations: read }, ({ query }) => result(async () => ({ items: await service.search(principal, query), limit: 50, exhaustive: false })));
    server.registerTool("gate_preview_spend", { description: "Read-only proposed spending evaluation. Does not reserve or pay.", inputSchema: proposalSchema, annotations: read }, input => result(() => service.previewProposal(principal, input)));
    server.registerTool("gate_request_spend", { description: "Record an explicitly reviewed sandbox proposal; requires idempotency_key. Payment needs separate finance consent.", inputSchema: proposalSchema.extend({ idempotency_key: keySchema }), annotations: { ...read, readOnlyHint: false } }, ({ idempotency_key, ...proposal }) => result(() => service.create(principal, proposal, idempotency_key)));
    server.registerTool("gate_get_request", { description: "Recover an existing request's decision, evidence and payment state.", inputSchema: z.object({ request_id: idSchema }).strict(), annotations: read }, ({ request_id }) => result(() => service.get(principal, request_id)));
    server.registerTool("gate_explain_request", { description: "Explain source evidence, policy, consent and sandbox receipt with audit references.", inputSchema: z.object({ request_id: idSchema }).strict(), annotations: read }, ({ request_id }) => result(() => service.explain(principal, request_id)));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    reply.hijack();
    try { await transport.handleRequest(req.raw, reply.raw, req.body); }
    finally { await server.close(); }
  } });
}

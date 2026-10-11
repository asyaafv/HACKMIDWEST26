/** Stateless Gate MCP transport delegates to REST's services; chat never supplies finance identity. */
import { Investigations } from "./investigations.js";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { DB } from "./db.js";
import type { GateService } from "./service.js";
import { authenticate } from "./auth.js";
import { authenticateDevRevMcp, type DevRevMcpIdentity } from "./devrev-auth.js";
import { toolSchemas, toolOutputSchema, SERVER_VERSION } from "./mcp-schemas.js";
import { capabilityAccess, TOOL_CAPABILITIES } from "./capabilities.js";
import { listRequests, sourceContext } from "./mcp-context.js";
import { GateError, requireThat } from "./errors.js";

export function attachMcp(app: FastifyInstance, db: DB, service: GateService, allowedHosts: string[], allowedOrigins: string[] = [], devrevIdentity?: DevRevMcpIdentity) {
  const investigations = new Investigations(db,service);
  app.route({ method: ["GET", "POST", "DELETE"], url: "/mcp", handler: async (req, reply) => {
    requireThat(allowedHosts.includes(req.headers.host ?? ""), "HOST_FORBIDDEN", "MCP host not allowed.", 403);
    if (req.headers.origin) requireThat(allowedOrigins.includes(req.headers.origin), "ORIGIN_FORBIDDEN", "MCP origin not allowed.", 403);
    const principal = devrevIdentity && req.headers.authorization?.startsWith("Bearer ") && !/^Bearer [a-f0-9]{64}$/.test(req.headers.authorization)
      ? await authenticateDevRevMcp(db, req.headers.authorization, devrevIdentity)
      : await authenticate(db, req.headers.authorization);
    if (req.method !== "POST") return reply.code(405).header("Allow", "POST").send({ error: "Stateless MCP accepts POST only." });
    const server = new McpServer({ name: "Gate", version: SERVER_VERSION });
    const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    const result = async (name: string, work: () => Promise<unknown>) => {
      try {
        capabilityAccess(principal, TOOL_CAPABILITIES[name]!);
        const data = await work();
        const envelope = { data, mode: "sandbox" as const, provider: "simulator" as const, trace_id: req.id, server_version: SERVER_VERSION, dataset_version: null };
        const text = JSON.stringify(envelope);
        requireThat(Buffer.byteLength(text) <= 32768, "OUTPUT_LIMIT", "Output too large; inspect the request through the scoped API.");
        return { content: [{ type: "text" as const, text }], structuredContent: envelope };
      } catch (error) {
        const code = error instanceof GateError ? error.code : error instanceof ZodError ? "INVALID_INPUT" : "DEPENDENCY_FAILURE";
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message: error instanceof GateError ? error.message : "Tool could not complete." } }) }] };
      }
    };
    server.registerTool('gate_list_investigations',{description:'List waiting, failed or expired investigations in granted projects.',inputSchema:toolSchemas.gate_list_investigations,outputSchema:toolOutputSchema,annotations:read},({limit})=>result('gate_list_investigations',()=>investigations.list(principal,limit)));
    server.registerTool('gate_start_investigation',{description:'Claim a proposal for ten minutes; returns the runId fencing token. No financial execution.',inputSchema:toolSchemas.gate_start_investigation,outputSchema:toolOutputSchema,annotations:{...read,readOnlyHint:false}},({request_id,idempotency_key,...body})=>result('gate_start_investigation',()=>investigations.start(principal,request_id,body,idempotency_key)));
    server.registerTool('gate_submit_evidence',{description:'Submit imported source hashes, verified links and unresolved questions; Gate reevaluates and archives a new revision. Return the backend decision.verdict and decision.riskAssessment.summary to the user, including APPROVE for low risk. The score is rule points, not a probability; finance consent is separate.',inputSchema:toolSchemas.gate_submit_evidence,outputSchema:toolOutputSchema,annotations:{...read,readOnlyHint:false}},({request_id,idempotency_key,...body})=>result('gate_submit_evidence',()=>investigations.submit(principal,request_id,body,idempotency_key)));
    server.registerTool('gate_fail_investigation',{description:'Record an investigation failure with a reason. Another run may retry it.',inputSchema:toolSchemas.gate_fail_investigation,outputSchema:toolOutputSchema,annotations:{...read,readOnlyHint:false}},({request_id,idempotency_key,...body})=>result('gate_fail_investigation',()=>investigations.fail(principal,request_id,body,idempotency_key)));
    server.registerTool("gate_catalog", { description: "Discover assigned agents/projects, configured merchants and sandbox limits.", inputSchema: toolSchemas.gate_catalog, outputSchema: toolOutputSchema, annotations: read }, () => result("gate_catalog", () => service.catalog(principal)));
    server.registerTool("gate_search_context", { description: "Search allowed imported source IDs/content; results are bounded, not exhaustive.", inputSchema: toolSchemas.gate_search_context, outputSchema: toolOutputSchema, annotations: read }, ({ query }) => result("gate_search_context", async () => ({ items: await service.search(principal, query), limit: 50, exhaustive: false })));
    server.registerTool("gate_get_context", { description: "Retrieve an exact authorized source with verified context and citations.", inputSchema: toolSchemas.gate_get_context, outputSchema: toolOutputSchema, annotations: read }, ({ source_domain, source_id }) => result("gate_get_context", () => sourceContext(db, principal, source_domain, source_id)));
    server.registerTool("gate_preview_spend", { description: "Read-only backend risk evaluation. Return decision.verdict, riskScore and riskAssessment.summary even for LOW risk / APPROVE. Rules and risk scores come from Gate; never invent a probability. Finance consent is separate.", inputSchema: toolSchemas.gate_preview_spend, outputSchema: toolOutputSchema, annotations: read }, input => result("gate_preview_spend", () => service.previewProposal(principal, input)));
    server.registerTool("gate_request_spend", { description: "Record an explicitly reviewed sandbox proposal; requires idempotency_key. Payment needs separate finance consent.", inputSchema: toolSchemas.gate_request_spend, outputSchema: toolOutputSchema, annotations: { ...read, readOnlyHint: false } }, ({ idempotency_key, ...proposal }) => result("gate_request_spend", () => service.create(principal, proposal, idempotency_key)));
    server.registerTool("gate_list_requests", { description: "Recover scoped requests with bounded cursor pagination.", inputSchema: toolSchemas.gate_list_requests, outputSchema: toolOutputSchema, annotations: read }, input => result("gate_list_requests", () => listRequests(db, principal, input)));
    server.registerTool("gate_get_request", { description: "Return a stored request's evidence, backend policy decision and review. Set validate_decision=true to rerun current backend checks and return validation.decision, including an explicit low-risk APPROVE recommendation. Validation is read-only; report CHANGED when the saved decision is stale.", inputSchema: toolSchemas.gate_get_request, outputSchema: toolOutputSchema, annotations: read }, ({ request_id, validate_decision }) => result("gate_get_request", async () => {
      const request = await service.get(principal, request_id);
      if (!validate_decision) return request;
      const validation = await service.validateDecision(principal, request_id);
      requireThat(request.version === validation.requestVersion, 'STALE_REQUEST', 'Request changed during validation. Fetch it again.', 409);
      return { ...request, validation };
    }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    reply.hijack();
    try { await transport.handleRequest(req.raw, reply.raw, req.body); }
    finally { await server.close(); }
  } });
}

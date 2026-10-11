/** REST boundary keeps shared demo reads/reviews separate from authenticated API and MCP workflows. */
import { Investigations } from "./investigations.js";
import { simulatePurchase } from "./simulation.js";
import { demoPrincipal, reviewTransaction, type DemoWorkspace } from "./transaction-review.js";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { transaction } from "./db.js";
import { roleAccess } from "./auth.js";
import { listRequests } from "./mcp-context.js";
import { getSourceDetail, getSourceContext } from "./evidence-service.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { authRoutes } from "./routes/auth.js";
import { httpAuthenticate } from "./sessions.js";
import { enforceHttpCapability } from "./capabilities.js";
import { proposalSchema } from "./contracts.js";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { DB } from "./db.js";
import { GateService } from "./service.js";
import { GateError, requireThat } from "./errors.js";
import { apiSchemas, idSchema, keySchema } from "./contracts.js";
import { attachMcp } from "./mcp.js";
import type { DevRevMcpIdentity } from "./devrev-auth.js";

export function createApp(db: DB, options: { origins?: string[]; mcpHosts?: string[]; logger?: boolean; developmentFaults?: boolean; paymentExecution?: boolean; browserHosts?: string[]; demoWorkspace?: DemoWorkspace; devrevIdentity?: DevRevMcpIdentity } = {}) {
  const app = Fastify({ logger: options.logger ? { redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-csrf-token", "req.body.password"], level: "info" } : false,
    bodyLimit: 32768, genReqId: () => randomUUID() });
  const service = new GateService(db);
  const investigations = new Investigations(db,service);
  app.register(rateLimit, { max: 60, timeWindow: "1 minute", keyGenerator: req => req.ip });
  const origins = options.origins ?? [];
  app.addHook("onRequest", async (req, reply) => {
    if (req.headers.origin) {
      requireThat(origins.includes(req.headers.origin), "ORIGIN_FORBIDDEN", "Origin not allowed.", 403);
      reply.header("Access-Control-Allow-Origin", req.headers.origin).header("Vary", "Origin");
      reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-CSRF-Token");
      reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return reply.code(204).send();
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "Input failed validation.", details: error.issues.map(i => ({ path: i.path, message: i.message })) }, meta: { traceId: req.id } });
    if (error instanceof GateError) return reply.code(error.status).send({ error: { code: error.code, message: error.message }, meta: { traceId: req.id } });
    const httpStatus = (error as { statusCode?: number }).statusCode;
    if (httpStatus && httpStatus < 500) return reply.code(httpStatus).send({ error: { code: "INVALID_REQUEST", message: "Invalid request." }, meta: { traceId: req.id } });
    req.log.error({ code: "INTERNAL_ERROR", traceId: req.id }, "Gate request failed");
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Request could not be completed." }, meta: { traceId: req.id } });
  });
  app.get("/health", async () => ({ ok: true, service: "gate-backend", mode: "sandbox", dashboard: true, demoDashboard: !!options.demoWorkspace, paymentExecution: !!options.paymentExecution }));
  app.get("/health/ready", async () => { await db.query("SELECT 1"); return { ok: true, service: "gate-backend" }; });
  const browserHosts = options.browserHosts ?? ["localhost:8000", "127.0.0.1:8000"];
  app.register(authRoutes, { prefix: "/v1", db, origins, hosts: browserHosts });
  // Anonymous access is limited to one explicitly configured demo workspace; MCP remains authenticated.
  if (options.demoWorkspace) app.register(async demo => {
    demo.addHook('onRequest', async req => {
      requireThat(browserHosts.includes(req.headers.host ?? ''), 'HOST_FORBIDDEN', 'Host not allowed.', 403);
      if (req.method !== 'GET') requireThat(!!req.headers.origin && origins.includes(req.headers.origin)
        && req.headers['sec-fetch-site'] !== 'cross-site', 'ORIGIN_FORBIDDEN', 'Review requires the dashboard origin.', 403);
    });
    demo.get('/dashboard', async req => {
      const p = await demoPrincipal(db,options.demoWorkspace!);
      return {data:{...await service.dashboard(p),identity:{id:p.id,orgId:p.orgId,role:p.role,capabilities:p.capabilities,actorMode:'shared_hackathon_demo'}},meta:{traceId:req.id}};
    });
    demo.get('/sources/search', async req => ({data:{items:await service.search(await demoPrincipal(db,options.demoWorkspace!),String((req.query as any).q ?? ''))},meta:{traceId:req.id}}));
    demo.post('/purchases', async (req,reply) => {
      const result = await simulatePurchase(db,service,await demoPrincipal(db,options.demoWorkspace!),req.body,keySchema.parse(req.headers['idempotency-key']));
      reply.code(201);return {data:result,meta:{traceId:req.id}};
    });
    demo.get('/transactions/:id/history', async req => ({data:await service.evaluationHistory(await demoPrincipal(db,options.demoWorkspace!),idSchema.parse((req.params as any).id)),meta:{traceId:req.id}}));
    demo.post('/transactions/:id/investigation', async req => ({data:await investigations.localRun(await demoPrincipal(db,options.demoWorkspace!),idSchema.parse((req.params as any).id),req.body,keySchema.parse(req.headers['idempotency-key'])),meta:{traceId:req.id}}));
    demo.post('/transactions/:id/review', async req => ({data:await reviewTransaction(db,
      await demoPrincipal(db,options.demoWorkspace!),idSchema.parse((req.params as any).id),req.body,keySchema.parse(req.headers['idempotency-key'])),meta:{traceId:req.id}}));
  }, {prefix:'/v1/demo'});

  app.register(async api => {
    api.addHook("onRequest", async req => { if (!req.headers.authorization && !req.headers.cookie) requireThat(false, "UNAUTHENTICATED", "A valid credential or session is required.", 401);
      if (req.url.split("?")[0]?.endsWith("/fault")) {
        requireThat(!!options.developmentFaults && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip) && browserHosts.includes(req.headers.host ?? ""), "FORBIDDEN", "Fault controls require explicit local development mode.", 403);
      }
      const p = await httpAuthenticate(db, req, origins, browserHosts); enforceHttpCapability(p, req.method, req.routeOptions.url ?? req.url); });
    const principal = (req: any) => httpAuthenticate(db, req, origins, browserHosts);
    const key = (req: any) => keySchema.parse(req.headers["idempotency-key"]);
    const id = (req: any) => idSchema.parse(req.params.id);
    const wrap = (data: unknown, traceId: string) => ({ data, meta: { traceId, mode: "sandbox", provider: "simulator" } });
    registerPaymentRoutes(api, { service, principal, development: !!options.developmentFaults });
    api.get("/me", async req => { const p = await principal(req); return wrap({ id: p.id, role: p.role, orgId: p.orgId, approvalLimitMinor: p.approvalLimitMinor, capabilities: p.capabilities, authMethod: p.authMethod }, req.id); });
    api.get("/schemas", async req => wrap({ contractVersion: "1.0.0", schemas: apiSchemas }, req.id));
    api.get("/integrations", async req => {
      const p = await principal(req);
      const data = await transaction(db, p.orgId, async tx => {
        const datasets = (await tx.query("SELECT DISTINCT dataset_label,manifest_hash FROM source_records WHERE org_id=$1 AND project_id IN (SELECT project_id FROM principal_projects WHERE org_id=$1 AND principal_id=$2) LIMIT 20", [p.orgId, p.id])).rows;
        const heartbeatTable = (await tx.query("SELECT to_regclass('worker_heartbeats') AS name")).rows[0]?.name;
        const lastSeen = heartbeatTable ? (await tx.query("SELECT max(last_seen_at) AS last_seen FROM worker_heartbeats")).rows[0]?.last_seen : null;
        return { datasets, worker: { status: lastSeen && Date.now() - new Date(lastSeen).getTime() < 60000 ? "LOCAL_ONLY" : "OFFLINE", lastSeenAt: lastSeen ?? null, scope: "process heartbeat; not proof of this tenant's payment completion" } };
      });
      return wrap({ ...data, database: { status: "LOCAL_ONLY", checkedAt: new Date().toISOString() }, devrev: { status: "NOT_CONFIGURED", reason: "No recorded remote tool-call proof." }, payment: { status: "LOCAL_ONLY", provider: "simulator", mode: "sandbox" }, consoleEnabled: false, paymentExecution: !!options.paymentExecution }, req.id);
    });
    api.get("/approvals", async req => { const p = await principal(req); roleAccess(p, ["FINANCE"]); const page = await listRequests(db, p, { status: "AWAITING_CONSENT", limit: 50, cursor: (req.query as any).cursor }); return wrap({ items: page.items.map(r => ({ id: r.id, workflowStatus: r.status, createdAt: r.created_at, agentId: r.agent_id, projectId: r.project_id, amountMinor: r.amount_minor })), limit: page.limit, nextCursor: page.next_cursor, exhaustive: !page.partial }, req.id); });
    api.get("/sources/detail", async req => {
      const p = await principal(req); const source = proposalSchema.shape.source.parse(req.query);
      const result = await transaction(db, p.orgId, tx => getSourceDetail(tx, p, source.domain, source.sourceId));
      requireThat(result, "NOT_FOUND", "Source not found.", 404); return wrap(result, req.id);
    });
    api.get("/sources/context", async req => {
      const p = await principal(req); const query = req.query as any;
      const projectId = idSchema.parse(query.projectId); const source = proposalSchema.shape.source.parse({ domain: query.domain, sourceId: query.sourceId });
      const result = await transaction(db, p.orgId, tx => getSourceContext(tx, p, projectId, source));
      requireThat(result, "NOT_FOUND", "Context not found.", 404); return wrap(result, req.id);
    });
    api.get("/dashboard", async req => wrap(await service.dashboard(await principal(req)), req.id));
    api.post("/requests/:id/review", async req => wrap(await service.consent(await principal(req), id(req), req.body, key(req), false), req.id));
    api.get("/catalog", async req => wrap(await service.catalog(await principal(req)), req.id));
    api.get("/requests", async req => wrap({ items: await service.list(await principal(req)), limit: 50, exhaustive: false }, req.id));
    api.post("/requests", async (req, reply) => { const result = await service.create(await principal(req), req.body, key(req)); reply.code(201).header("Location", `/v1/requests/${result.id}`); return wrap(result, req.id); });
    api.post("/policy/preview", async req => wrap(await service.previewProposal(await principal(req), req.body), req.id));
    api.get("/requests/:id", async req => wrap(await service.get(await principal(req), id(req)), req.id));

    api.get('/requests/:id/history', async req => wrap(await service.evaluationHistory(await principal(req),id(req)),req.id));
    api.post('/requests/:id/investigation/start', async req => wrap(await investigations.start(await principal(req),id(req),req.body,key(req)),req.id));
    api.post('/requests/:id/investigation/evidence', async req => wrap(await investigations.submit(await principal(req),id(req),req.body,key(req)),req.id));
    api.post('/requests/:id/investigation/fail', async req => wrap(await investigations.fail(await principal(req),id(req),req.body,key(req)),req.id));
    api.get("/requests/:id/evidence", async req => wrap((await service.get(await principal(req), id(req))).evidence, req.id));
    api.post("/requests/:id/preview", async req => wrap(await service.preview(await principal(req), id(req), key(req)), req.id));
    api.post("/requests/:id/consent", async req => { requireThat(!!options.paymentExecution, "EXECUTION_DISABLED", "Gate records enterprise reviews without executing payments.", 403); return wrap(await service.consent(await principal(req), id(req), req.body, key(req)), req.id); });
    api.post("/requests/:id/cancel", async req => wrap(await service.cancel(await principal(req), id(req), key(req)), req.id));
    api.get("/requests/:id/events", async req => wrap(await service.events(await principal(req), id(req)), req.id));
    api.get("/requests/:id/explanation", async req => wrap(await service.explain(await principal(req), id(req)), req.id));
    api.get("/sources/search", async req => wrap({ items: await service.search(await principal(req), String((req.query as any).q ?? "")), exhaustive: false }, req.id));
  }, { prefix: "/v1" });
  attachMcp(app, db, service, options.mcpHosts ?? ["localhost:8000", "127.0.0.1:8000"], origins, options.devrevIdentity);
  return app;
}

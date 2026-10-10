/** Fastify REST boundary: validates requests, authenticates bearer identities, and returns safe errors. */
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { DB } from "./db.js";
import { authenticate } from "./auth.js";
import { GateService } from "./service.js";
import { GateError, requireThat } from "./errors.js";
import { idSchema, keySchema } from "./contracts.js";
import { attachMcp } from "./mcp.js";

export function createApp(db: DB, options: { origins?: string[]; mcpHosts?: string[]; logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ? { redact: ["req.headers.authorization", "req.headers.cookie"], level: "info" } : false,
    bodyLimit: 32768, genReqId: () => randomUUID() });
  const service = new GateService(db);
  app.register(rateLimit, { max: 60, timeWindow: "1 minute", keyGenerator: req => req.ip });
  const origins = options.origins ?? [];
  app.addHook("onRequest", async (req, reply) => {
    if (req.headers.origin) {
      requireThat(origins.includes(req.headers.origin), "ORIGIN_FORBIDDEN", "Origin not allowed.", 403);
      reply.header("Access-Control-Allow-Origin", req.headers.origin).header("Vary", "Origin");
      reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
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
  app.get("/health", async () => ({ ok: true, service: "gate-backend", mode: "sandbox" }));
  app.get("/health/ready", async () => { await db.query("SELECT 1"); return { ok: true, service: "gate-backend" }; });
  app.register(async api => {
    api.addHook("onRequest", async req => { await authenticate(db, req.headers.authorization); });
    const principal = (req: any) => authenticate(db, req.headers.authorization);
    const key = (req: any) => keySchema.parse(req.headers["idempotency-key"]);
    const id = (req: any) => idSchema.parse(req.params.id);
    const wrap = (data: unknown, traceId: string) => ({ data, meta: { traceId, mode: "sandbox", provider: "simulator" } });
    api.get("/me", async req => { const p = await principal(req); return wrap({ id: p.id, role: p.role, orgId: p.orgId }, req.id); });
    api.get("/catalog", async req => wrap(await service.catalog(await principal(req)), req.id));
    api.get("/requests", async req => wrap({ items: await service.list(await principal(req)), limit: 50, exhaustive: false }, req.id));
    api.post("/requests", async (req, reply) => { const result = await service.create(await principal(req), req.body, key(req)); reply.code(201).header("Location", `/v1/requests/${result.id}`); return wrap(result, req.id); });
    api.post("/policy/preview", async req => wrap(await service.previewProposal(await principal(req), req.body), req.id));
    api.get("/requests/:id", async req => wrap(await service.get(await principal(req), id(req)), req.id));
    api.get("/requests/:id/evidence", async req => wrap((await service.get(await principal(req), id(req))).evidence, req.id));
    api.post("/requests/:id/preview", async req => wrap(await service.preview(await principal(req), id(req), key(req)), req.id));
    api.post("/requests/:id/consent", async req => wrap(await service.consent(await principal(req), id(req), req.body, key(req)), req.id));
    api.post("/requests/:id/cancel", async req => wrap(await service.cancel(await principal(req), id(req), key(req)), req.id));
    api.get("/requests/:id/events", async req => wrap(await service.events(await principal(req), id(req)), req.id));
    api.get("/requests/:id/explanation", async req => wrap(await service.explain(await principal(req), id(req)), req.id));
    api.get("/sources/search", async req => wrap({ items: await service.search(await principal(req), String((req.query as any).q ?? "")), exhaustive: false }, req.id));
  }, { prefix: "/v1" });
  attachMcp(app, db, service, options.mcpHosts ?? ["localhost:8000", "127.0.0.1:8000"]);
  return app;
}
